import type { Module } from "./curriculum";
import type { ProgressRecord } from "./db/types";

const DAY = 86400000;
/** Advisory six-week lesson plan, followed by two weeks for review and thesis work. */
export function studentModuleProgress(module: Module, records: ProgressRecord[], now = Date.now()) {
  const lessons = module.courses.flatMap((course) => Array.from({ length: module.lessons_per_course }, (_, i) => ({ id: `${course.slug}-${i + 1}`, courseSlug: course.slug, n: i + 1 })));
  const completed = new Set(records.map((row) => row.lessonId).filter((id) => lessons.some((lesson) => lesson.id === id)));
  const start = Date.parse(`${module.release_date}T11:00:00.000Z`);
  const elapsed = Math.max(0, now - start);
  const target = now <= start ? 0 : Math.min(lessons.length, Math.floor(elapsed / (42 * DAY) * lessons.length));
  return {
    completed, total: lessons.length,
    percent: lessons.length ? Math.round(completed.size / lessons.length * 100) : 0,
    next: lessons.find((lesson) => !completed.has(lesson.id)) ?? null,
    target, behind: Math.max(0, target - completed.size),
    week: now < start ? 0 : Math.min(8, Math.floor(elapsed / (7 * DAY)) + 1),
    lessonsTargetDate: new Date(start + 42 * DAY).toISOString(),
    reviewTargetDate: new Date(start + 56 * DAY).toISOString(),
    planEnded: now >= start + 56 * DAY,
  };
}
