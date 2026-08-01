import { cookies } from "next/headers";

import { COOKIE, MAX_AGE, parseSession, serialiseSession } from "./auth-core";
import { db } from "./db";
import type { Student } from "./db/types";

export { hashPassword, verifyPassword } from "./auth-core";

export async function startSession(studentId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, serialiseSession(studentId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in student, or null. Safe to call from any server component. */
export async function currentStudent(): Promise<Student | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const studentId = parseSession(raw);
  if (!studentId) return null;
  return db.getStudentById(studentId);
}

export function isStaff(student: Student): boolean {
  return student.role === "staff" || student.role === "admin";
}
