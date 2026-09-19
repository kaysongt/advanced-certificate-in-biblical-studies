"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth-core";
import { endSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { resetRateKey, resetTokenStudentId, verifyPasswordResetToken } from "@/lib/password-reset-core";

export type ResetPasswordState = { error?: string };
const invalidLink = "This reset link has expired or has already been used. Please request a new link.";
const schema = z.object({
  token: z.string().max(300),
  password: z.string().min(10).max(200),
  confirmPassword: z.string().min(10).max(200),
}).refine((input) => input.password === input.confirmPassword);

export async function resetPassword(_previous: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({ token: formData.get("token"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { error: "Use at least 10 characters and make sure both passwords match." };
  try {
    const requestHeaders = await headers();
    const ip = process.env.VERCEL ? requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown" : "local";
    if (!await db.takeAuthRateLimit(resetRateKey("redeem-ip", ip), 20, 15 * 60_000)) return { error: "Too many attempts. Please wait 15 minutes before trying again." };
    const { token, password } = parsed.data;
    const studentId = resetTokenStudentId(token);
    if (!studentId) return { error: invalidLink };
    const student = await db.getStudentById(studentId);
    if (!student || !verifyPasswordResetToken(token, student.id, student.passwordHash)) return { error: invalidLink };
    if (await verifyPassword(password, student.passwordHash)) return { error: "Choose a new password that is different from your current password." };
    const passwordHash = await hashPassword(password);
    // Verify expiry again after hashing; compare-and-set prevents concurrent reuse.
    if (!verifyPasswordResetToken(token, student.id, student.passwordHash) || !await db.compareAndSetStudentPassword(student.id, student.passwordHash, passwordHash)) return { error: invalidLink };
    await endSession();
  } catch {
    console.error("password_reset_redemption_failed");
    return { error: "We could not reset your password right now. Please try again or contact kti@kingsword.org." };
  }
  redirect("/login?reset=success");
}
