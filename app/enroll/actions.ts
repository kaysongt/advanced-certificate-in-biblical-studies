"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { hashPassword, startSession } from "@/lib/auth";
import { getPurchasableModules } from "@/lib/content";
import { PRICING } from "@/lib/curriculum";
import { db } from "@/lib/db";
import { StorageUnavailableError } from "@/lib/db/types";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const registrationSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name.").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254),
  country: z.string().trim().min(1, "Please select your country.").max(80),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
  plan: z.enum(["certificate", "advanced"]),
  product: z.string().trim().max(80),
  privacyAccepted: z
    .string()
    .refine((value) => value === "yes", "Please confirm that you have read the privacy notice."),
});

export async function registerStudent(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    country: String(formData.get("country") ?? ""),
    password: String(formData.get("password") ?? ""),
    plan: String(formData.get("plan") ?? "advanced"),
    product: String(formData.get("product") ?? ""),
    privacyAccepted: String(formData.get("privacyAccepted") ?? ""),
    website: String(formData.get("website") ?? ""),
  };
  const values = {
    fullName: raw.fullName.trim(),
    email: raw.email.trim(),
    country: raw.country.trim(),
    plan: raw.plan,
    product: raw.product.trim(),
    privacyAccepted: raw.privacyAccepted,
  };
  if (raw.website.trim()) {
    return { error: "We could not create your enrollment. Please try again." };
  }
  const parsed = registrationSchema.safeParse(raw);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { fieldErrors, values };
  }

  const { fullName, email, country, password, plan, product } = parsed.data;
  const purchasableProducts = new Set(getPurchasableModules().map((module) => module.slug));
  if (plan === "certificate" && !purchasableProducts.has(product)) {
    return {
      fieldErrors: { product: "Please choose a certificate from the published program." },
      values,
    };
  }

  let studentId: string;
  try {
    if (await db.getStudentByEmail(email)) {
      return {
        fieldErrors: { email: "An account with this email already exists." },
        values,
      };
    }

    const price = plan === "advanced" ? PRICING.advanced : PRICING.certificate;
    const { student } = await db.createStudentWithEnrollment(
      {
        fullName,
        email,
        country,
        passwordHash: await hashPassword(password),
      },
      {
        product: plan === "advanced" ? "advanced" : product,
        plan,
        status: "pending",
        amount: price.amount,
        currency: price.currency,
        provider: null,
        providerRef: null,
      }
    );
    studentId = student.id;
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return {
        error: "Enrollment storage is unavailable. Please email kti@kingsword.org for help.",
        values,
      };
    }
    return { error: "We could not create your enrollment. Please try again.", values };
  }

  await startSession(studentId);
  redirect("/dashboard");
}
