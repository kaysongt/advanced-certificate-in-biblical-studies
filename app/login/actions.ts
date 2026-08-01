"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { endSession, startSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

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
  redirect(next);
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/");
}
