import fs from "node:fs";
import path from "node:path";

import { CONTENT_DIR, TODO, getCurriculum, lessonId, type Course, type Module } from "./curriculum";
import {
  Collector,
  extractQuizQuestions,
  mdToHtml,
  parseFrontMatter,
  type FrontMatter,
  type QuizQuestion,
} from "./markdown";

export type Doc = { meta: FrontMatter; body: string };

/**
 * Read a content file with line endings normalized to LF.
 *
 * This repo is checked out with core.autocrlf=true on Windows, so content/ files
 * arrive as CRLF. The ::: directive regex anchors on `$\n` and silently matches
 * nothing against `\r\n`, which drops every objectives/scripture/terms/quiz block
 * from the rendered output. Normalise once, here, rather than loosening the regex.
 */
function readRaw(...segments: string[]): string | null {
  try {
    return fs
      .readFileSync(path.join(CONTENT_DIR, ...segments), "utf8")
      .replace(/\r\n/g, "\n");
  } catch {
    return null;
  }
}

function readDoc(...segments: string[]): Doc {
  const raw = readRaw(...segments);
  return raw === null ? { meta: {}, body: "" } : parseFrontMatter(raw);
}

function countTodos(...segments: string[]): number {
  const raw = readRaw(...segments);
  return raw === null ? 0 : raw.split(TODO).length - 1;
}

function cleanTitle(meta: FrontMatter, fallback: string): string {
  const t = (meta.title ?? "").split(TODO).join("").trim();
  return t || fallback;
}

const lessonFile = (n: number) => `lesson-${String(n).padStart(2, "0")}.md`;

// ------------------------------------------------------------------ lessons

export type LessonRow = {
  n: number;
  title: string;
  reading: string;
  duration: string;
  id: string;
  todos: number;
  written: boolean;
};

/** Lesson metadata for a course, in order. */
export function getLessonRows(module: Module, course: Course): LessonRow[] {
  const rows: LessonRow[] = [];
  for (let n = 1; n <= module.lessons_per_course; n++) {
    const { meta } = readDoc(module.slug, course.slug, lessonFile(n));
    const todos = countTodos(module.slug, course.slug, lessonFile(n));
    rows.push({
      n,
      title: cleanTitle(meta, `Topic ${n}`),
      reading: (meta.reading ?? "").split(TODO).join("").trim(),
      duration: meta.duration ?? "1 hr",
      id: lessonId(course.slug, n),
      todos,
      written: todos === 0,
    });
  }
  return rows;
}

export function getLesson(module: Module, course: Course, n: number) {
  const doc = readDoc(module.slug, course.slug, lessonFile(n));
  const collector = new Collector();
  collector.at(`${course.code} Topic ${n}`, `/courses/${course.slug}/${n}`);
  return { ...doc, html: mdToHtml(doc.body, collector) };
}

export function getCourseDoc(module: Module, course: Course) {
  const doc = readDoc(module.slug, course.slug, "course.md");
  return { ...doc, html: mdToHtml(stripSections(doc.body, ["Instructor Notes"])) };
}

export function getAssessmentDoc(module: Module, course: Course) {
  const doc = readDoc(module.slug, course.slug, "assessment.md");
  return { ...doc, html: mdToHtml(doc.body) };
}

type ExternalQuestionBank = {
  questions?: {
    id?: string;
    stem?: string;
    options?: string[];
    correct?: number;
    explanation?: string;
  }[];
};

/** All authored quiz questions available for fresh, randomized course attempts. */
export function getAssessmentBank(module: Module, course: Course): QuizQuestion[] {
  const authored: QuizQuestion[] = [];
  const assessment = readDoc(module.slug, course.slug, "assessment.md");
  authored.push(...extractQuizQuestions(assessment.body, `${course.slug}-assessment`));

  for (let n = 1; n <= module.lessons_per_course; n++) {
    const lesson = readDoc(module.slug, course.slug, lessonFile(n));
    authored.push(...extractQuizQuestions(lesson.body, `${course.slug}-topic-${n}`));
  }

  const rawExternal = readRaw(module.slug, course.slug, "question-bank.json");
  if (rawExternal) {
    try {
      const external = JSON.parse(rawExternal) as ExternalQuestionBank;
      for (const [index, question] of (external.questions ?? []).entries()) {
        if (
          !question.stem ||
          !Array.isArray(question.options) ||
          question.options.length < 2 ||
          !Number.isInteger(question.correct) ||
          question.correct! < 0 ||
          question.correct! >= question.options.length
        ) {
          continue;
        }
        authored.push({
          id: question.id ?? `${course.slug}-external-${index + 1}`,
          stem: question.stem,
          options: question.options.map((text, optionIndex) => ({
            correct: optionIndex === question.correct,
            text,
          })),
          explanation: question.explanation ?? "",
        });
      }
    } catch {
      // A malformed optional bank must not take the authored course offline.
    }
  }

  const seen = new Set<string>();
  return authored.filter((question) => {
    const key = question.stem.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Instructor-marked sections that follow the randomized multiple-choice section. */
export function getAssessmentWrittenHtml(module: Module, course: Course): string {
  const { body } = readDoc(module.slug, course.slug, "assessment.md");
  const start = body.search(/^## Section B\b/m);
  return start < 0 ? "" : mdToHtml(body.slice(start));
}

export type AudioTrack = { title: string; url: string };
export type CourseAudio = { title: string; folderUrl: string; tracks: AudioTrack[] };

/** Chapter-by-chapter audiobook supplied for each Module I textbook. */
export function getCourseAudio(courseSlug: string): CourseAudio | null {
  const raw = readRaw("01-systematic-theology", "audio-library.json");
  if (!raw) return null;
  try {
    const library = JSON.parse(raw) as Record<string, CourseAudio>;
    const course = library[courseSlug];
    if (!course) return null;
    const rank = (title: string) => {
      if (/preface/i.test(title)) return 0;
      if (/epilogue/i.test(title)) return 1000;
      return Number(title.match(/chapter\s+(\d+)/i)?.[1]) || 900;
    };
    const displayTitle = (title: string) =>
      title
        .replace(/\.mp3$/i, "")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    return {
      ...course,
      tracks: course.tracks
        .map((track) => ({ ...track, title: displayTitle(track.title) }))
        .sort((a, b) => rank(a.title) - rank(b.title)),
    };
  } catch {
    return null;
  }
}

export function getModuleDoc(module: Module) {
  const doc = readDoc(module.slug, "module.md");
  return {
    ...doc,
    html: mdToHtml(stripSections(doc.body, ["What Students Gain", "Instructor Notes"])),
  };
}

export function getProgramDoc() {
  const doc = readDoc("program.md");
  return { ...doc, html: mdToHtml(doc.body) };
}

function stripSections(body: string, headings: string[]): string {
  const excluded = new Set(headings);
  const kept: string[] = [];
  let skipping = false;

  for (const line of body.split("\n")) {
    const heading = line.match(/^##\s+(.+)$/)?.[1]?.trim();
    if (heading) {
      skipping = excluded.has(heading);
      if (skipping) continue;
    }
    if (!skipping) kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimStart();
}

// ---------------------------------------------------------------- progress

export type CourseStatus = {
  course: Course;
  module: Module;
  lessons: number;
  written: number;
  todos: number;
  complete: boolean;
};

/** How much of each course is actually written. Drives "available now" badges. */
export function getCourseStatuses(): CourseStatus[] {
  const out: CourseStatus[] = [];
  for (const module of getCurriculum().modules) {
    for (const course of module.courses) {
      const rows = getLessonRows(module, course);
      const extra =
        countTodos(module.slug, course.slug, "course.md") +
        countTodos(module.slug, course.slug, "assessment.md");
      const todos = rows.reduce((sum, r) => sum + r.todos, 0) + extra;
      out.push({
        course,
        module,
        lessons: rows.length,
        written: rows.filter((r) => r.written).length,
        todos,
        complete: todos === 0,
      });
    }
  }
  return out;
}

export type ModuleStatus = {
  module: Module;
  courses: number;
  coursesComplete: number;
  todos: number;
  complete: boolean;
};

export function getModuleStatuses(): ModuleStatus[] {
  const statuses = getCourseStatuses();
  return getCurriculum().modules.map((module) => {
    const mine = statuses.filter((s) => s.module.slug === module.slug);
    const todos =
      mine.reduce((sum, s) => sum + s.todos, 0) + countTodos(module.slug, "module.md");
    return {
      module,
      courses: mine.length,
      coursesComplete: mine.filter((s) => s.complete).length,
      todos,
      complete: todos === 0,
    };
  });
}

/** Modules a student can actually study today — used to gate what we sell. */
export function getAvailableModules(): Module[] {
  return getModuleStatuses()
    .filter((s) => s.complete)
    .map((s) => s.module);
}

// ----------------------------------------------------------------- indexes

/**
 * Walk every lesson once, collecting glossary terms and scripture refs.
 * Cached per process — this reads 240+ files.
 */
let indexCache: { terms: Collector["terms"]; scriptures: Collector["scriptures"] } | null = null;

export function getIndexes() {
  if (indexCache) return indexCache;

  const collector = new Collector();
  for (const module of getCurriculum().modules) {
    for (const course of module.courses) {
      for (let n = 1; n <= module.lessons_per_course; n++) {
        const { meta, body } = readDoc(module.slug, course.slug, lessonFile(n));
        const title = `${course.code} Topic ${n}: ${cleanTitle(meta, `Topic ${n}`)}`;
        collector.at(title, `/courses/${course.slug}/${n}`);
        mdToHtml(body, collector);
      }
    }
  }

  indexCache = { terms: collector.terms, scriptures: collector.scriptures };
  return indexCache;
}
