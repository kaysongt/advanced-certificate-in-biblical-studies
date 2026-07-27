"use server";

import { revalidatePath } from "next/cache";

import { currentStudent } from "@/lib/auth";
import { db } from "@/lib/db";

export async function setTopicComplete(
  lessonId: string,
  complete: boolean,
  path: string
): Promise<void> {
  const student = await currentStudent();
  if (!student) return;

  if (complete) await db.markLessonComplete(student.id, lessonId);
  else await db.clearLessonComplete(student.id, lessonId);

  revalidatePath(path);
}
