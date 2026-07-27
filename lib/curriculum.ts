import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const CONTENT_DIR = path.join(ROOT, "content");
export const TODO = "[FROM BOOK]";

export type Course = {
  code: string;
  slug: string;
  title: string;
  subtitle: string;
  series_line?: string;
  description: string;
  textbook?: string;
  isbn?: string;
};

/** One video per module, shown after the final course. Null until supplied. */
export type ModuleVideo = {
  title: string | null;
  url: string | null;
  speaker: string | null;
  duration: string | null;
};

export type Module = {
  numeral: string;
  number: number;
  slug: string;
  title: string;
  short_title: string;
  series: string;
  hours: number;
  overview: string;
  catalog_blurb: string;
  hours_per_course: number;
  /** Topics per course. The hierarchy is Module → Course → Topic. */
  lessons_per_course: number;
  courses: Course[];
  video?: ModuleVideo;
};

export type Curriculum = {
  program: {
    institute: string;
    title: string;
    tagline: string;
    summary: string;
    about: string;
    motto: string;
    founder: { name: string; role: string; bio: string };
    total_hours: number;
    total_certificates: number;
    total_courses: number;
    total_textbooks: number;
    audience: string[];
    features: string[];
    outcomes: string[];
    format: string;
    tuition: string;
    graduation_requirements: string;
    contact: { phone: string; email: string; website: string };
  };
  grading: {
    note: string;
    components: { name: string; weight: number }[];
    pass_mark: number;
    /** Students cannot advance past a topic or course until they pass it. */
    must_pass_to_advance: boolean;
    scale: { grade: string; range: string }[];
  };
  modules: Module[];
};

let cached: Curriculum | null = null;

export function getCurriculum(): Curriculum {
  if (!cached) {
    const raw = fs.readFileSync(path.join(ROOT, "curriculum.json"), "utf8");
    cached = JSON.parse(raw) as Curriculum;
  }
  return cached;
}

export function getModule(slug: string): Module | undefined {
  return getCurriculum().modules.find((m) => m.slug === slug);
}

/** Find a course by its url slug (e.g. "st-101"), with its parent module. */
export function findCourse(
  slug: string
): { module: Module; course: Course } | undefined {
  for (const module of getCurriculum().modules) {
    const course = module.courses.find((c) => c.slug === slug);
    if (course) return { module, course };
  }
  return undefined;
}

/** Every course slug, for static generation. */
export function allCourseSlugs(): string[] {
  return getCurriculum().modules.flatMap((m) => m.courses.map((c) => c.slug));
}

/**
 * Stable lesson id, matching the `data-lesson` format the existing
 * course.js progress tracker already writes: "{course-slug}-{n}".
 */
export function lessonId(courseSlug: string, n: number): string {
  return `${courseSlug}-${n}`;
}

/** Pricing is stated in the catalog copy; surfaced here as structured data. */
export const PRICING = {
  certificate: { amount: 250, currency: "USD", label: "$250" },
  advanced: { amount: 1000, currency: "USD", label: "$1,000" },
} as const;
