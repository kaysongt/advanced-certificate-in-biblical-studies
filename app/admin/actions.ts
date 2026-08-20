"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { currentStudent, hashPassword, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";

async function staffMember() {
  const student = await currentStudent();
  if (!student || !isStaff(student)) redirect("/");
  return student;
}

/**
 * Stricter than staffMember(): resetting a password is account takeover, so it
 * is limited to ADMIN and not extended to STAFF.
 */
async function administrator() {
  const student = await currentStudent();
  if (!student || student.role !== "admin") redirect("/");
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

const scholarshipReviewSchema = z.object({
  applicationId: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  adminNotes: z.string().trim().max(2000),
});

export async function reviewScholarshipApplication(formData: FormData): Promise<void> {
  const reviewer = await staffMember();
  const input = scholarshipReviewSchema.parse({
    applicationId: formData.get("applicationId"),
    decision: formData.get("decision"),
    adminNotes: formData.get("adminNotes") ?? "",
  });
  await db.reviewScholarshipApplication({
    applicationId: input.applicationId,
    reviewerId: reviewer.id,
    decision: input.decision,
    adminNotes: input.adminNotes,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/scholarships");
  revalidatePath("/dashboard");
  revalidatePath("/scholarship");
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

const roleChangeSchema = z.object({
  studentId: z.string().uuid(),
  role: z.enum(["student", "staff", "admin"]),
});

/**
 * Promotes or demotes an account. Two locks, because this is the one action
 * that can end with nobody able to reach /admin:
 *
 *  - you cannot change your own role, so an admin cannot demote themselves;
 *  - the last remaining admin cannot be demoted by anyone.
 */
export async function setStudentRole(formData: FormData): Promise<void> {
  const actor = await administrator();
  const parsed = roleChangeSchema.safeParse({
    studentId: formData.get("studentId"),
    role: formData.get("role"),
  });
  if (!parsed.success) redirect("/admin?role=invalid#students");

  if (parsed.data.studentId === actor.id) redirect("/admin?role=self#students");

  const student = await db.getStudentById(parsed.data.studentId);
  if (!student) redirect("/admin?role=missing#students");
  if (student.role === parsed.data.role) redirect("/admin?role=nochange#students");

  if (student.role === "admin" && parsed.data.role !== "admin") {
    const admins = (await db.listStudents()).filter((person) => person.role === "admin");
    if (admins.length <= 1) redirect("/admin?role=last#students");
  }

  await db.updateStudentRole(student.id, parsed.data.role);
  revalidatePath("/admin");
  redirect("/admin?role=done#students");
}

const passwordResetSchema = z.object({
  studentId: z.string().uuid(),
  newPassword: z.string().min(10, "Use at least 10 characters.").max(200),
});

/**
 * Sets a new password for any student. The admin has to hand it to them out of
 * band; nothing is emailed, and the old password is unrecoverable either way.
 */
export async function resetStudentPassword(formData: FormData): Promise<void> {
  await administrator();
  const parsed = passwordResetSchema.safeParse({
    studentId: formData.get("studentId"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) redirect("/admin?reset=invalid#students");

  const student = await db.getStudentById(parsed.data.studentId);
  if (!student) redirect("/admin?reset=missing#students");

  await db.updateStudentPassword(student.id, await hashPassword(parsed.data.newPassword));
  revalidatePath("/admin");
  redirect("/admin?reset=done#students");
}
