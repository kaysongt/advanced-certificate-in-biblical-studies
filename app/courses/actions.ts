"use server";

import { revalidatePath } from "next/cache";

import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { findCourse, lessonId as makeLessonId } from "@/lib/curriculum";
import { db } from "@/lib/db";
import { StorageUnavailableError } from "@/lib/db/types";

export async function setTopicComplete(
  courseSlug: string,
  lessonId: string,
  complete: boolean,
  path: string
): Promise<void> {
  const student = await currentStudent();
  if (!student) return;

  const found = findCourse(courseSlug);
  const topicNumber = Number(lessonId.slice(courseSlug.length + 1));
  if (
    !found ||
    !Number.isInteger(topicNumber) ||
    makeLessonId(courseSlug, topicNumber) !== lessonId
  ) {
    return;
  }

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasActiveAccess(enrollments, found.module.slug)) return;

  try {
    if (complete) await db.markLessonComplete(student.id, lessonId);
    else await db.clearLessonComplete(student.id, lessonId);
  } catch (err) {
    // Progress is not worth a hard failure — the client already shows the
    // topic as complete. It will not survive a reload until storage exists.
    if (err instanceof StorageUnavailableError) return;
    throw err;
  }

  const expectedPath = `/courses/${courseSlug}/${topicNumber}`;
  revalidatePath(path === expectedPath ? path : expectedPath);
}
