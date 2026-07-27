import fs from "node:fs";
import path from "node:path";

import { CONTENT_DIR, TODO, getCurriculum, lessonId, type Course, type Module } from "./curriculum";
import { Collector, mdToHtml, parseFrontMatter, type FrontMatter } from "./markdown";

export type Doc = { meta: FrontMatter; body: string };

/**
 * Read a content file with line endings normalised to LF.
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
      title: cleanTitle(meta, `Lesson ${n}`),
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
  collector.at(`${course.code} L${n}`, `/courses/${course.slug}/${n}`);
  return { ...doc, html: mdToHtml(doc.body, collector) };
}

export function getCourseDoc(module: Module, course: Course) {
  const doc = readDoc(module.slug, course.slug, "course.md");
  return { ...doc, html: mdToHtml(doc.body) };
}

export function getAssessmentDoc(module: Module, course: Course) {
  const doc = readDoc(module.slug, course.slug, "assessment.md");
  return { ...doc, html: mdToHtml(doc.body) };
}

export function getModuleDoc(module: Module) {
  const doc = readDoc(module.slug, "module.md");
  return { ...doc, html: mdToHtml(doc.body) };
}

export function getProgramDoc() {
  const doc = readDoc("program.md");
  return { ...doc, html: mdToHtml(doc.body) };
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
        const title = `${course.code} L${n}: ${cleanTitle(meta, `Lesson ${n}`)}`;
        collector.at(title, `/courses/${course.slug}/${n}`);
        mdToHtml(body, collector);
      }
    }
  }

  indexCache = { terms: collector.terms, scriptures: collector.scriptures };
  return indexCache;
}
