"use server";

import { revalidatePath } from "next/cache";

import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { getModule } from "@/lib/curriculum";
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
  if (!hasActiveAccess(enrollments, module.slug)) {
    return { error: "Enroll in this certificate before posting to its community group." };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 12) {
    return { error: "Write at least a short, thoughtful contribution before posting." };
  }
  if (body.length > 750) {
    return { error: "Keep each contribution to 750 characters or fewer." };
  }

  try {
    await db.createCommunityPost({ moduleSlug, studentId: student.id, body });
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return { error: "Discussion storage is temporarily unavailable. Please try again shortly." };
    }
    throw error;
  }

  revalidatePath(`/community/${module.slug}`);
  revalidatePath("/community");
  revalidatePath("/dashboard");
  return { success: "Your contribution has been added to the group." };
}
