"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { currentStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { StorageUnavailableError } from "@/lib/db/types";

export type ScholarshipFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const scholarshipSchema = z.object({
  enrollmentId: z.string().uuid(),
  financialNeed: z
    .string()
    .trim()
    .min(40, "Please share a little more about your financial circumstances.")
    .max(3000),
  trainingGoals: z
    .string()
    .trim()
    .min(40, "Please share a little more about how you plan to use the training.")
    .max(3000),
  amountAbleToPay: z.coerce
    .number()
    .int("Please enter a whole-dollar amount.")
    .min(0, "The contribution amount cannot be negative."),
  informationAccurate: z
    .string()
    .refine((value) => value === "yes", "Please confirm that the information is accurate."),
});

export async function submitScholarshipApplication(
  _previous: ScholarshipFormState,
  formData: FormData
): Promise<ScholarshipFormState> {
  const student = await currentStudent();
  if (!student) redirect("/login?next=/dashboard");

  const raw = {
    enrollmentId: String(formData.get("enrollmentId") ?? ""),
    financialNeed: String(formData.get("financialNeed") ?? ""),
    trainingGoals: String(formData.get("trainingGoals") ?? ""),
    amountAbleToPay: String(formData.get("amountAbleToPay") ?? "0"),
    informationAccurate: String(formData.get("informationAccurate") ?? ""),
    website: String(formData.get("website") ?? ""),
  };
  const values = {
    financialNeed: raw.financialNeed,
    trainingGoals: raw.trainingGoals,
    amountAbleToPay: raw.amountAbleToPay,
    informationAccurate: raw.informationAccurate,
  };
  if (raw.website.trim()) {
    return { error: "We could not submit this application. Please try again." };
  }

  const parsed = scholarshipSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { fieldErrors, values };
  }

  const enrollment = (await db.getEnrollmentsForStudent(student.id)).find(
    (item) => item.id === parsed.data.enrollmentId
  );
  if (!enrollment || enrollment.status !== "pending") {
    return {
      error: "This enrollment is not eligible for a scholarship application.",
      values,
    };
  }
  if (parsed.data.amountAbleToPay > enrollment.amount) {
    return {
      fieldErrors: {
        amountAbleToPay: `Enter an amount between $0 and $${enrollment.amount}.`,
      },
      values,
    };
  }

  try {
    const existing = await db.getScholarshipApplicationForEnrollment(
      enrollment.id,
      student.id
    );
    if (existing) redirect(`/scholarship?enrollment=${enrollment.id}`);

    const application = await db.createScholarshipApplication({
      enrollmentId: enrollment.id,
      studentId: student.id,
      financialNeed: parsed.data.financialNeed,
      trainingGoals: parsed.data.trainingGoals,
      amountAbleToPay: parsed.data.amountAbleToPay,
    });
    if (!application) {
      return {
        error: "This enrollment is no longer eligible for a scholarship application.",
        values,
      };
    }
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return {
        error: "Scholarship applications are temporarily unavailable. Please try again later.",
        values,
      };
    }
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  redirect("/dashboard?payment=scholarship-submitted");
}
