import { cookies } from "next/headers";
import { previewModeSelected } from "./course-preview";
import type { Student } from "./db/types";

export const LEARNING_MODE_COOKIE = "kti.learning-mode";
export async function isCoursePreview(student: Pick<Student, "id" | "role">): Promise<boolean> {
  return previewModeSelected(student, (await cookies()).get(LEARNING_MODE_COOKIE)?.value);
}
