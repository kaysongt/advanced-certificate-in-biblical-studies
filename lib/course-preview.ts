import type { Student } from "./db/types";
import { getCurriculum, isModuleReleased } from "./curriculum";

/** Course review is independent of staff privileges and tuition entitlements.
 * Student reviewers return to ordinary student mode at launch so learning
 * progress, quiz deadlines and payment restrictions apply. Staff retain permission
 * to preview; the selected learning mode decides whether they are previewing.
 */
export function canPreviewCourses(
  student: Pick<Student, "id" | "role">,
  reviewerIds = process.env.COURSE_REVIEWER_IDS ?? "",
  now = new Date(),
): boolean {
  return student.role === "admin" || student.role === "staff" ||
    (!isModuleReleased(getCurriculum().modules[0], now) && student.id.length > 0 && reviewerIds.split(",").some((id) => id.trim() === student.id));
}

/** Permission to preview is not a request to preview. After launch, staff study by default. */
export function previewModeSelected(
  student: Pick<Student, "id" | "role">,
  preference?: string,
  now = new Date(),
  reviewerIds = process.env.COURSE_REVIEWER_IDS ?? "",
): boolean {
  if (!canPreviewCourses(student, reviewerIds, now)) return false;
  if (preference === student.id + ":preview") return true;
  if (preference === student.id + ":study") return false;
  return !isModuleReleased(getCurriculum().modules[0], now);
}
