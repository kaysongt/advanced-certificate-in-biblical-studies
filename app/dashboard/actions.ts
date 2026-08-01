"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { currentStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCheckoutForEnrollment } from "@/lib/payments/create-checkout";

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

