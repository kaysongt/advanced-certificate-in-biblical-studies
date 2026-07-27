import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Framework-free auth primitives: password hashing and cookie signing.
 * Kept separate from lib/auth.ts so it can be unit-tested without Next's
 * request context (next/headers throws outside a request).
 */

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

export const COOKIE = "kti_session";
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  // Dev only — sessions do not survive a restart, which is fine locally.
  return "dev-only-insecure-secret";
}

// ------------------------------------------------------------- passwords

/** scrypt with a per-password salt. Format: scrypt$<salt>$<key>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// -------------------------------------------------------------- sessions

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

/** Cookie value is "<studentId>.<expiry>.<hmac>" — tamper-evident, no storage needed. */
export function serialiseSession(studentId: string): string {
  const expires = Date.now() + MAX_AGE * 1000;
  const payload = `${studentId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the student id if the cookie is authentic and unexpired, else null. */
export function parseSession(raw: string): string | null {
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [studentId, expires, mac] = parts;
  const expected = sign(`${studentId}.${expires}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  return studentId;
}
