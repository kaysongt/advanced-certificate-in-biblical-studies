import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { resetTokenStudentId, verifyPasswordResetToken } from "@/lib/password-reset-core";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const id = resetTokenStudentId(token);
  const student = id ? await db.getStudentById(id) : null;
  const valid = student ? verifyPasswordResetToken(token, student.id, student.passwordHash) : false;
  return <main className="shell" id="main-content" tabIndex={-1}><div className="authwrap"><div className="authcard">
    <div className="eyebrow">Secure account recovery</div>
    <h1>Reset your password</h1>
    {valid ? <><p className="sub">Choose a new password for your KTI account. Your enrollment, course progress, and access will stay unchanged.</p><ResetPasswordForm token={token} /></> : <>
      <div className="notice warn" role="alert">This reset link is invalid, expired, or already used. Request a new link to continue.</div>
      <Link className="btn primary lg" href="/forgot-password">Request a new reset link</Link>
    </>}
    <p className="formfoot"><Link href="/login">Back to sign in</Link></p>
  </div></div></main>;
}
