/**
 * Creates a dev student with an active enrolment and prints a session cookie,
 * so gated routes can be exercised locally. Dev only.
 *
 * Usage: SESSION_SECRET=... npx tsx scripts/seed-dev.ts
 */

import { hashPassword, serialiseSession, COOKIE } from "../lib/auth-core";
import { db } from "../lib/db";

async function main() {
  const email = "dev@kingsword.test";

  let student = await db.getStudentByEmail(email);
  if (!student) {
    student = await db.createStudent({
      fullName: "Dev Student",
      email,
      country: "Nigeria",
      passwordHash: await hashPassword("devpassword123"),
    });
    await db.createEnrolment({
      studentId: student.id,
      product: "advanced",
      plan: "advanced",
      status: "active",
      amount: 1000,
      currency: "USD",
      provider: "manual",
      providerRef: "dev-seed",
    });
  }

  console.log(`${COOKIE}=${serialiseSession(student.id)}`);
}

main();
