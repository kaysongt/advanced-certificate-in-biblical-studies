"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { currentStudent, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";

async function staffMember() {
  const student = await currentStudent();
  if (!student || !isStaff(student)) redirect("/");
  return student;
}

const activationSchema = z.object({
  enrollmentId: z.string().uuid(),
  paymentReference: z.string().trim().min(3).max(120),
});

export async function activateEnrollment(formData: FormData): Promise<void> {
  await staffMember();
  const input = activationSchema.parse({
    enrollmentId: formData.get("enrollmentId"),
    paymentReference: formData.get("paymentReference"),
  });
  await db.activateEnrollment(input.enrollmentId, input.paymentReference, "manual");
  revalidatePath("/admin");
}

const gradeSchema = z.object({
  submissionId: z.string().uuid(),
  writtenPoints: z.coerce.number().int().min(0).max(60),
  feedback: z.string().trim().min(3).max(3000),
});

export async function gradeAssessment(formData: FormData): Promise<void> {
  const grader = await staffMember();
  const input = gradeSchema.parse({
    submissionId: formData.get("submissionId"),
    writtenPoints: formData.get("writtenPoints"),
    feedback: formData.get("feedback"),
  });
  await db.gradeAssessment({
    id: input.submissionId,
    graderId: grader.id,
    writtenPoints: input.writtenPoints,
    feedback: input.feedback,
  });
  revalidatePath("/admin");
}

const moderationSchema = z.object({
  postId: z.string().uuid(),
  engagementCredits: z.coerce.number().int().min(0).max(10),
  hidden: z.enum(["yes", "no"]),
});

export async function moderateCommunityPost(formData: FormData): Promise<void> {
  const moderator = await staffMember();
  const input = moderationSchema.parse({
    postId: formData.get("postId"),
    engagementCredits: formData.get("engagementCredits"),
    hidden: formData.get("hidden") ?? "no",
  });
  await db.moderateCommunityPost({
    postId: input.postId,
    moderatorId: moderator.id,
    engagementCredits: input.engagementCredits,
    hidden: input.hidden === "yes",
  });
  revalidatePath("/admin");
  revalidatePath("/community");
}
