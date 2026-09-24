import "server-only";
import { db } from "./db";
import { prisma } from "./db/prisma";
import { classifyRegistrations, isInternalRegistration, REGISTRATION_GROUPS, type RegistrationPayment } from "./registration-groups";

/** Caller must authorize staff access before loading this private report. */
export async function loadRegistrationReport() {
  const [allStudents, enrollments, scholarships, storedAttempts] = await Promise.all([
    db.listStudents(), db.listEnrollments(), db.listRegistrationScholarships(),
    process.env.DATABASE_URL ? prisma.stripePaymentAttempt.findMany({
      select: { enrollmentId: true, status: true, promotionCode: true, discountAmountMinor: true,
        paidAmountMinor: true, refundedAmountMinor: true, currency: true, needsReview: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }) : Promise.resolve([]),
  ]);
  const attempts: RegistrationPayment[] = storedAttempts.map((attempt) => ({
    ...attempt, status: attempt.status.toLowerCase().replaceAll("_", "-"), updatedAt: attempt.updatedAt.toISOString(),
  }));
  const students = allStudents.filter((student) => !isInternalRegistration(student));
  const excludedInternalAccounts = allStudents.length - students.length;
  const evidence = classifyRegistrations(students, enrollments, scholarships, attempts);
  const rank = new Map(REGISTRATION_GROUPS.map((group, i) => [group.key, i]));
  students.sort((a, b) => rank.get(evidence.get(a.id)!.group)! - rank.get(evidence.get(b.id)!.group)! || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { students, enrollments, evidence, excludedInternalAccounts, pendingScholarships: scholarships.filter((a) => a.status === "pending").length };
}
