"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { currentStudent, hashPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCheckoutForEnrollment } from "@/lib/payments/create-checkout";
import { createPaystackCheckout } from "@/lib/payments/create-paystack-checkout";

const checkoutSchema = z.object({ enrollmentId: z.string().uuid() });

export async function beginStripeCheckout(formData: FormData): Promise<void> {
  const student = await currentStudent();
  if (!student) redirect("/login");

  const parsed = checkoutSchema.safeParse({ enrollmentId: formData.get("enrollmentId") });
  if (!parsed.success) redirect("/dashboard?payment=invalid");

  const enrollment = (await db.getEnrollmentsForStudent(student.id)).find(
    (candidate) => candidate.id === parsed.data.enrollmentId
  );
  if (!enrollment || enrollment.status !== "pending") {
    redirect("/dashboard?payment=invalid");
  }

  let destination: string;
  try {
    const result = await createCheckoutForEnrollment({ studentId: student.id, enrollment });
    destination =
      result.kind === "checkout" ? result.url : "/dashboard?payment=processing";
  } catch (error) {
    console.error("Stripe Checkout creation failed", {
      enrollmentId: enrollment.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    destination = "/dashboard?payment=unavailable";
  }

  redirect(destination);
}


/**
 * Self-service password change for any signed-in student.
 *
 * The current password is required: a stolen session should not be enough to
 * take an account over permanently. Length matches the 10-character minimum
 * enforced at registration in app/enroll/actions.ts.
 */
const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(10, "Use at least 10 characters.").max(200),
    confirmPassword: z.string().min(1).max(200),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: "The new passwords do not match.",
  });

export async function changeOwnPassword(formData: FormData): Promise<void> {
  const student = await currentStudent();
  if (!student) redirect("/login");

  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) redirect("/dashboard?password=invalid#password");

  const correct = await verifyPassword(parsed.data.currentPassword, student.passwordHash);
  if (!correct) redirect("/dashboard?password=wrong#password");

  if (parsed.data.newPassword === parsed.data.currentPassword) {
    redirect("/dashboard?password=same#password");
  }

  await db.updateStudentPassword(student.id, await hashPassword(parsed.data.newPassword));
  redirect("/dashboard?password=changed#password");
}

/**
 * Naira checkout for students in Nigeria. Same guards as the Stripe path:
 * the enrollment must belong to the signed-in student and still be pending.
 */
export async function beginPaystackCheckout(formData: FormData): Promise<void> {
  const student = await currentStudent();
  if (!student) redirect("/login");

  const parsed = checkoutSchema.safeParse({ enrollmentId: formData.get("enrollmentId") });
  if (!parsed.success) redirect("/dashboard?payment=invalid");

  const enrollment = (await db.getEnrollmentsForStudent(student.id)).find(
    (candidate) => candidate.id === parsed.data.enrollmentId
  );
  if (!enrollment || enrollment.status !== "pending") {
    redirect("/dashboard?payment=invalid");
  }

  let destination: string;
  try {
    const result = await createPaystackCheckout({
      studentId: student.id,
      enrollment: { id: enrollment.id, plan: enrollment.plan },
    });
    destination = result.kind === "checkout" ? result.url : "/dashboard?payment=unavailable";
  } catch {
    destination = "/dashboard?payment=failed";
  }
  redirect(destination);
}
