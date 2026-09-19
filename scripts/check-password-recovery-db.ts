/** Isolated Neon-branch integration test. Never point at the production host. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db/prisma";
import { prismaStore as db } from "../lib/db/prisma-store";
import { hashPassword, verifyPassword } from "../lib/auth-core";
import { issuePasswordResetToken, verifyPasswordResetToken } from "../lib/password-reset-core";

async function main() {
  const host = new URL(process.env.DATABASE_URL || "http://invalid").hostname;
  if (host.replace("-pooler", "") !== "ep-morning-math-awwl10ba.c-12.us-east-1.aws.neon.tech") throw new Error("Use only the isolated password-recovery verification branch.");
  const id = randomUUID();
  const oldHash = await hashPassword("old-password-for-test-only");
  const newHash = await hashPassword("new-password-for-test-only");
  const key = `reset-test-${id}`;
  try {
    await prisma.student.create({ data: { id, email: `${id}@example.test`, fullName: "Recovery verification", country: "Test", role: "ADMIN", passwordHash: oldHash } });
    const token = issuePasswordResetToken(id, oldHash);
    assert.ok(verifyPasswordResetToken(token, id, oldHash));
    const results = await Promise.all(Array.from({ length: 5 }, () => db.compareAndSetStudentPassword(id, oldHash, newHash)));
    assert.equal(results.filter(Boolean).length, 1);
    const student = await db.getStudentById(id);
    assert.equal(student!.role, "admin");
    assert.ok(student!.passwordChangedAt);
    assert.ok(await verifyPassword("new-password-for-test-only", student!.passwordHash));
    assert.equal(await verifyPassword("old-password-for-test-only", student!.passwordHash), false);
    assert.equal(verifyPasswordResetToken(token, id, student!.passwordHash), false);
    const now = new Date();
    const limits = await Promise.all(Array.from({ length: 10 }, () => db.takeAuthRateLimit(key, 3, 60_000, now)));
    assert.equal(limits.filter(Boolean).length, 3);
    assert.ok(await db.takeAuthRateLimit(key, 3, 60_000, new Date(now.getTime() + 60_000)));
    console.log("PASS: PostgreSQL atomic one-use reset, password verification, role preservation, timestamp, concurrent request limits, and window expiry.");
  } finally {
    await prisma.student.deleteMany({ where: { id } });
    await prisma.authRateLimit.deleteMany({ where: { key } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
