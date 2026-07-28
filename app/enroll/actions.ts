"use server";

import { redirect } from "next/navigation";

import { hashPassword, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { StorageUnavailableError, type Plan } from "@/lib/db/types";
import { PRICING, getCurriculum } from "@/lib/curriculum";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerStudent(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const plan = String(formData.get("plan") ?? "advanced") as Plan;
  const product = String(formData.get("product") ?? "").trim();

  const values = { fullName, email, country, plan, product };
  const fieldErrors: Record<string, string> = {};

  if (fullName.length < 2) fieldErrors.fullName = "Please enter your full name.";
  if (!EMAIL.test(email)) fieldErrors.email = "Please enter a valid email address.";
  if (!country) fieldErrors.country = "Please select your country.";
  if (password.length < 8) fieldErrors.password = "Use at least 8 characters.";

  const moduleSlugs = getCurriculum().modules.map((m) => m.slug);
  if (plan === "certificate" && !moduleSlugs.includes(product)) {
    fieldErrors.product = "Please choose which certificate you want to start with.";
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  let studentId: string;
  try {
    if (await db.getStudentByEmail(email)) {
      return {
        fieldErrors: { email: "An account with this email already exists." },
        values,
      };
    }

    const student = await db.createStudent({
      fullName,
      email,
      country,
      passwordHash: await hashPassword(password),
    });
    studentId = student.id;

    const price = plan === "advanced" ? PRICING.advanced : PRICING.certificate;
    await db.createEnrolment({
      studentId: student.id,
      product: plan === "advanced" ? "advanced" : product,
      plan,
      // Payment is not connected yet — see HANDOVER.md §4.3. Enrolments stay
      // pending until a payment webhook activates them.
      status: "pending",
      amount: price.amount,
      currency: price.currency,
      provider: null,
      providerRef: null,
    });
  } catch (err) {
    if (err instanceof StorageUnavailableError) {
      return {
        error:
          "Enrolment is not open yet — we cannot save your details on this server " +
          "right now. Please email kti@kingsword.org and we will enrol you directly.",
        values,
      };
    }
    throw err;
  }

  await startSession(studentId);
  redirect("/dashboard");
}
