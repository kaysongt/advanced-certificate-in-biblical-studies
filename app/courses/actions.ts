"use server";

import { revalidatePath } from "next/cache";

import { currentStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { StorageUnavailableError } from "@/lib/db/types";

export async function setTopicComplete(
  lessonId: string,
  complete: boolean,
  path: string
): Promise<void> {
  const student = await currentStudent();
  if (!student) return;

  try {
    if (complete) await db.markLessonComplete(student.id, lessonId);
    else await db.clearLessonComplete(student.id, lessonId);
  } catch (err) {
    // Progress is not worth a hard failure — the client already shows the
    // topic as complete. It will not survive a reload until storage exists.
    if (err instanceof StorageUnavailableError) return;
    throw err;
  }

  revalidatePath(path);
}
