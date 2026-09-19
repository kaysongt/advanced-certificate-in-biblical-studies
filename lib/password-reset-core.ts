import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./auth-core";

export const RESET_LIFETIME_MS = 30 * 60 * 1000;
export const RESET_REQUEST_MESSAGE = "If an account exists for that email, a password reset link will arrive shortly. Check your inbox and spam folder. You can request up to three links every 30 minutes.";

// Bound to the current password hash: changing the password invalidates every
// outstanding link. Atomic compare-and-set in storage makes redemption single-use.
export function issuePasswordResetToken(studentId: string, passwordHash: string, now = Date.now()): string {
  const payload = `${studentId}.${now + RESET_LIFETIME_MS}.${randomBytes(32).toString("hex")}`;
  const mac = createHmac("sha256", sessionSecret()).update(`password-reset:${payload}:${passwordHash}`).digest("hex");
  return `${payload}.${mac}`;
}

export function resetTokenStudentId(token: string, now = Date.now()): string | null {
  if (token.length > 300) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, expires, nonce, mac] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{13}$/.test(expires) || !/^[0-9a-f]{64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(mac)) return null;
  const expiry = Number(expires);
  return expiry > now && expiry <= now + RESET_LIFETIME_MS ? id : null;
}

export function verifyPasswordResetToken(token: string, studentId: string, passwordHash: string, now = Date.now()): boolean {
  if (resetTokenStudentId(token, now) !== studentId) return false;
  const parts = token.split(".");
  const expected = createHmac("sha256", sessionSecret()).update(`password-reset:${parts.slice(0, 3).join(".")}:${passwordHash}`).digest("hex");
  return timingSafeEqual(Buffer.from(parts[3], "hex"), Buffer.from(expected, "hex"));
}

export function resetRateKey(kind: string, value: string): string {
  return createHmac("sha256", sessionSecret()).update(`password-reset-rate:${kind}:${value}`).digest("hex");
}

export function buildPasswordResetEmail(resetUrl: string) {
  const escapedUrl = resetUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    subject: "Reset your KTI password",
    text: `Reset your KingsWord Training Institute password\n\nOpen this link to choose a new password:\n${resetUrl}\n\nThis link expires in 30 minutes and can be used only once. If you did not request this, ignore this email; your password has not changed. Never share this link.\n\nNeed help? Email kti@kingsword.org.`,
    html: `<div style="background:#f4f0e7;padding:32px 16px;font-family:Arial,sans-serif;color:#14283f"><div style="max-width:520px;margin:auto;background:#fffdf8;padding:32px;border-radius:16px"><p style="color:#8d6a22;font-size:12px;letter-spacing:2px">KINGSWORD TRAINING INSTITUTE</p><h1 style="font-size:28px">Reset your password</h1><p>Use the secure link below to choose a new password for your existing KTI account.</p><p style="margin:28px 0"><a href="${escapedUrl}" style="display:inline-block;background:#142f50;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none">Choose a new password</a></p><p>This link expires in <strong>30 minutes</strong> and can be used only once.</p><p>If you did not request this, ignore this email. Your password has not changed. Never share this link.</p><p style="font-size:13px">If the button does not work, copy this link into your browser:<br><a href="${escapedUrl}" style="word-break:break-all">${escapedUrl}</a></p><p>Need help? <a href="mailto:kti@kingsword.org">Contact the KTI team</a>.</p></div></div>`,
  };
}
