import "server-only";

import { randomUUID } from "node:crypto";

import {
  EnrollmentStatus,
  PaystackPaymentStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Attempt lifecycle for Paystack, mirroring lib/payments/stripe-store.ts.
 *
 * `activeKey` holds the enrollment id while an attempt is live, so the unique
 * index makes concurrent checkout clicks collapse onto one attempt. A terminal
 * attempt releases the key and a retry can start fresh.
 */

const reusableStatuses = new Set<PaystackPaymentStatus>([
  PaystackPaymentStatus.CREATED,
  PaystackPaymentStatus.OPEN,
]);

export class PaystackAttemptError extends Error {
  constructor(
    public readonly code: "not_found" | "not_pending" | "record_mismatch",
    message: string
  ) {
    super(message);
    this.name = "PaystackAttemptError";
  }
}

/** Paystack references must be unique per integration and are visible to staff. */
export function newReference(): string {
  return `kti_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export async function preparePaystackAttempt(input: {
  studentId: string;
  enrollmentId: string;
  expectedAmountMinor: number;
}) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const enrollment = await transaction.enrollment.findFirst({
        where: { id: input.enrollmentId, studentId: input.studentId },
        include: { student: true },
      });
      if (!enrollment) throw new PaystackAttemptError("not_found", "Enrollment not found.");
      if (enrollment.status !== EnrollmentStatus.PENDING) {
        throw new PaystackAttemptError(
          "not_pending",
          "This enrollment is no longer awaiting payment."
        );
      }

      const existing = await transaction.paystackPaymentAttempt.findUnique({
        where: { activeKey: enrollment.id },
      });
      if (existing && reusableStatuses.has(existing.status)) {
        return { attempt: existing, enrollment };
      }
      if (existing) {
        await transaction.paystackPaymentAttempt.update({
          where: { id: existing.id },
          data: { activeKey: null },
        });
      }

      const attempt = await transaction.paystackPaymentAttempt.create({
        data: {
          enrollmentId: enrollment.id,
          activeKey: enrollment.id,
          reference: newReference(),
          expectedAmountMinor: input.expectedAmountMinor,
          currency: "NGN",
        },
      });
      return { attempt, enrollment };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const [concurrent, enrollment] = await Promise.all([
        prisma.paystackPaymentAttempt.findUnique({ where: { activeKey: input.enrollmentId } }),
        prisma.enrollment.findFirst({
          where: { id: input.enrollmentId, studentId: input.studentId },
          include: { student: true },
        }),
      ]);
      if (concurrent && enrollment) return { attempt: concurrent, enrollment };
    }
    throw error;
  }
}

export async function markAttemptOpen(attemptId: string): Promise<void> {
  await prisma.paystackPaymentAttempt.updateMany({
    where: { id: attemptId, status: PaystackPaymentStatus.CREATED },
    data: { status: PaystackPaymentStatus.OPEN },
  });
}

export async function releaseAttempt(attemptId: string): Promise<void> {
  await prisma.paystackPaymentAttempt.update({
    where: { id: attemptId },
    data: { activeKey: null, status: PaystackPaymentStatus.FAILED },
  });
}

export type SettlementOutcome = "processed" | "review" | "ignored" | "unknown_reference";

/**
 * Records a verified Paystack transaction and activates the enrollment.
 *
 * Runs from both the callback and the webhook, so it has to be idempotent: an
 * attempt already marked PAID short-circuits. A wrong amount or currency is
 * recorded and flagged for staff instead of granting access.
 */
export async function settleTransaction(input: {
  reference: string;
  transactionId: number;
  status: string;
  amountMinor: number;
  currency: string;
  channel: string | null;
  paidAt: Date | null;
}): Promise<SettlementOutcome> {
  return prisma.$transaction(async (transaction) => {
    const attempt = await transaction.paystackPaymentAttempt.findUnique({
      where: { reference: input.reference },
      include: { enrollment: true },
    });
    if (!attempt) return "unknown_reference";
    if (attempt.status === PaystackPaymentStatus.PAID) return "ignored";

    if (input.status !== "success") {
      await transaction.paystackPaymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status:
            input.status === "abandoned"
              ? PaystackPaymentStatus.ABANDONED
              : PaystackPaymentStatus.FAILED,
          activeKey: null,
          transactionId: String(input.transactionId),
          channel: input.channel,
          lastEventAt: new Date(),
        },
      });
      return "processed";
    }

    const wrongAmount = input.amountMinor !== attempt.expectedAmountMinor;
    const wrongCurrency = input.currency.toUpperCase() !== attempt.currency.toUpperCase();
    const alreadyActive = attempt.enrollment.status === EnrollmentStatus.ACTIVE;
    const needsReview = wrongAmount || wrongCurrency || alreadyActive;

    await transaction.paystackPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaystackPaymentStatus.PAID,
        activeKey: null,
        transactionId: String(input.transactionId),
        paidAmountMinor: input.amountMinor,
        channel: input.channel,
        paidAt: input.paidAt ?? new Date(),
        lastEventAt: new Date(),
        needsReview,
        reviewReason: wrongAmount
          ? "Paid amount does not match the expected tuition."
          : wrongCurrency
            ? "Paid in an unexpected currency."
            : alreadyActive
              ? "Payment arrived after the enrollment was already active."
              : null,
      },
    });

    // A mismatch is never allowed to open access on its own.
    if (attempt.enrollment.status === EnrollmentStatus.PENDING && !wrongAmount && !wrongCurrency) {
      await transaction.enrollment.update({
        where: { id: attempt.enrollmentId },
        data: {
          status: EnrollmentStatus.ACTIVE,
          provider: "paystack",
          providerRef: input.reference,
          activatedAt: new Date(),
          accessSuspendedAt: null,
        },
      });
    }

    return needsReview ? "review" : "processed";
  });
}
