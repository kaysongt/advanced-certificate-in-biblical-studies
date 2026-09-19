import "server-only";

import { Resend } from "resend";
import { db } from "./db";
import { buildPasswordResetEmail, issuePasswordResetToken } from "./password-reset-core";

export function passwordResetConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)) return null;
  const base = new URL(process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.thekti.org");
  if (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.hostname === "localhost")) return null;
  return {
    apiKey,
    origin: base.origin,
    from: process.env.PASSWORD_RESET_FROM?.trim() || process.env.PAYMENT_REMINDER_FROM?.trim() || "KingsWord Training Institute <reminders@thekti.org>",
  };
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const configuration = passwordResetConfiguration();
  if (!configuration) throw new Error("Password reset email is not configured.");
  const student = await db.getStudentByEmail(email);
  if (!student) return;
  const token = issuePasswordResetToken(student.id, student.passwordHash);
  const url = `${configuration.origin}/reset-password?token=${encodeURIComponent(token)}`;
  const message = buildPasswordResetEmail(url);
  const result = await new Resend(configuration.apiKey).emails.send({
    from: configuration.from,
    to: student.email,
    replyTo: "kti@kingsword.org",
    ...message,
    tags: [{ name: "category", value: "password-reset" }],
  });
  // Do not log the link, email address, password hash, or provider response body.
  if (result.error || !result.data?.id) throw new Error("Password reset email delivery failed.");
  console.info("password_reset_email_accepted", { messageId: result.data.id });
}
