"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { mustPayBeforeStudying } from "@/lib/access";
import { endSession, startSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStripeCheckoutConfigured } from "@/lib/payments/stripe-client";

export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  next: z.string().max(500),
});

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? ""),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const { email, password, next: requested } = parsed.data;
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
  const student = await db.getStudentByEmail(email);
  const valid = student ? await verifyPassword(password, student.passwordHash) : false;
  if (!student || !valid) {
    return { error: "That email and password do not match.", email };
  }

  await startSession(student.id);

  // Students who registered before checkout was live owe tuition. Send them
  // straight to payment instead of wherever they were heading — but only once
  // they can actually pay, so a missing Stripe configuration never strands them.
  if (isStripeCheckoutConfigured()) {
    const enrollments = await db.getEnrollmentsForStudent(student.id);
    if (mustPayBeforeStudying(enrollments)) redirect("/dashboard?payment=required");
  }
  redirect(next);
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/");
}
