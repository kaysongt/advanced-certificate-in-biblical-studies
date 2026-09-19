"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { RESET_REQUEST_MESSAGE, resetRateKey } from "@/lib/password-reset-core";
import { passwordResetConfiguration, sendPasswordResetEmail } from "@/lib/password-reset";

export type ForgotPasswordState = { error?: string; message?: string };

export async function requestPasswordReset(_previous: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter the email address you used to register." };
  try {
    if (!passwordResetConfiguration()) return { error: "Password reset emails are temporarily unavailable. Please contact kti@kingsword.org for help." };
    const requestHeaders = await headers();
    // Vercel overwrites x-vercel-forwarded-for. Never trust a caller-supplied
    // x-forwarded-for to bypass production rate limits.
    const ip = process.env.VERCEL ? requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown" : "local";
    const ipAllowed = await db.takeAuthRateLimit(resetRateKey("request-ip", ip), 10, 15 * 60_000);
    const emailAllowed = ipAllowed && await db.takeAuthRateLimit(resetRateKey("email", email.data), 3, 30 * 60_000);
    if (emailAllowed) {
      // Identical response before account lookup/send, preventing enumeration
      // through either content or delivery timing. after() is awaited by Vercel.
      after(async () => {
        try { await sendPasswordResetEmail(email.data); }
        catch { console.error("password_reset_email_failed"); }
      });
    }
    return { message: RESET_REQUEST_MESSAGE };
  } catch {
    console.error("password_reset_request_failed");
    return { error: "We could not process your request right now. Please try again shortly or contact kti@kingsword.org." };
  }
}
