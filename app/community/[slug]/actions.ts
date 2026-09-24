"use server";

import { revalidatePath } from "next/cache";

import { hasActiveAccess } from "@/lib/access";
import { currentStudent, isStaff } from "@/lib/auth";
import { getModule, isModuleReleased } from "@/lib/curriculum";
import { findDiscussionLesson } from "@/lib/discussion-target";
import { db } from "@/lib/db";
import { StorageUnavailableError } from "@/lib/db/types";

export type CommunityState = { error?: string; success?: string };

/** Adds an enrolled student's contribution to a single module discussion group. */
export async function addCommunityPost(
  moduleSlug: string,
  _previous: CommunityState,
  formData: FormData
): Promise<CommunityState> {
  const student = await currentStudent();
  if (!student) return { error: "Sign in to join the discussion." };

  const module = getModule(moduleSlug);
  if (!module) return { error: "This module discussion is unavailable." };

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!isStaff(student) && !hasActiveAccess(enrollments, module.slug)) {
    return { error: "Enroll in this certificate before posting to its community group." };
  }

  const lessonId = String(formData.get("lessonId") ?? "").trim() || null;
  const target = lessonId ? findDiscussionLesson(module.slug, lessonId) : null;
  if (lessonId && !target) return { error: "This lesson discussion is unavailable." };
  if (target && !isStaff(student)) {
    if (!isModuleReleased(module)) return { error: "This module has not opened yet." };
    const done = new Set((await db.getProgress(student.id)).map((item) => item.lessonId));
    if (target.rows.some((row) => row.n < target.row.n && !done.has(row.id))) {
      return { error: "Complete the earlier lessons before joining this discussion." };
    }
  }

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 12) {
    return { error: "Write at least a short, thoughtful contribution before posting." };
  }
  if (body.length > 750) {
    return { error: "Keep each contribution to 750 characters or fewer." };
  }

  try {
    if (!(await db.takeAuthRateLimit(`community:${student.id}`, 6, 60_000))) {
      return { error: "Please wait a minute before posting again. Your text is still here." };
    }
    await db.createCommunityPost({ moduleSlug, lessonId, studentId: student.id, body });
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return { error: "Discussion storage is temporarily unavailable. Please try again shortly." };
    }
    console.error("Community post could not be saved", { moduleSlug, lessonId });
    return { error: "Your contribution could not be saved. Please try again." };
  }

  revalidatePath(`/community/${module.slug}`);
  revalidatePath("/community");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  if (target) revalidatePath(`/courses/${target.course.slug}/${target.row.n}`);
  return { success: "Your contribution has been added to the group." };
}
