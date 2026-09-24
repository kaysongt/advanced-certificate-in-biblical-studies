import { getLessonRows } from "./content";
import { getModule } from "./curriculum";

/** Resolve only authored lessons belonging to this module; never trust a form ID. */
export function findDiscussionLesson(moduleSlug: string, lessonId: string) {
  const module = getModule(moduleSlug);
  if (!module) return null;
  for (const course of module.courses) {
    const rows = getLessonRows(module, course);
    const row = rows.find((item) => item.id === lessonId && item.written);
    if (row && rows.every((item) => item.written)) {
      return { course, row, rows, href: `/courses/${course.slug}/${row.n}#discussion` };
    }
  }
  return null;
}
