import type { Student } from "./db/types";
import { getCurriculum, isModuleReleased } from "./curriculum";

/** Course review is independent of staff privileges and tuition entitlements.
 * Student reviewers return to ordinary student mode at launch so learning
 * progress, quiz deadlines and payment restrictions apply. Staff retain preview.
 */
export function canPreviewCourses(
  student: Pick<Student, "id" | "role">,
  reviewerIds = process.env.COURSE_REVIEWER_IDS ?? "",
  now = new Date(),
): boolean {
  return student.role === "admin" || student.role === "staff" ||
    (!isModuleReleased(getCurriculum().modules[0], now) && student.id.length > 0 && reviewerIds.split(",").some((id) => id.trim() === student.id));
}
