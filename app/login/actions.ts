"use server";

import { redirect } from "next/navigation";

import { endSession, startSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export type LoginState = { error?: string; email?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  const student = await db.getStudentByEmail(email);
  // Same message either way — do not reveal which accounts exist.
  const ok = student ? await verifyPassword(password, student.passwordHash) : false;
  if (!student || !ok) {
    return { error: "That email and password do not match.", email };
  }

  await startSession(student.id);
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/");
}
