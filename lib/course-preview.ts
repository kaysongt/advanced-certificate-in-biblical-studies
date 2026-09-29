import type { Student } from "./db/types";

/** Course review is independent of staff privileges and tuition entitlements.
 * Configure account IDs server-side; removing an ID revokes preview on refresh.
 */
export function canPreviewCourses(
  student: Pick<Student, "id" | "role">,
  reviewerIds = process.env.COURSE_REVIEWER_IDS ?? "",
): boolean {
  return student.role === "admin" || student.role === "staff" ||
    (student.id.length > 0 && reviewerIds.split(",").some((id) => id.trim() === student.id));
}
