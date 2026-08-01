import "server-only";

import {
  EnrollmentStatus,
  Prisma,
  StripePaymentStatus,
  type EnrollmentPlan,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type StripePaymentAttemptSummary = {
  id: string;
  enrollmentId: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  status:
    | "created"
    | "open"
    | "processing"
    | "paid"
    | "failed"
    | "expired"
    | "partially-refunded"
    | "refunded"
    | "disputed";
  paidAmountMinor: number;
  refundedAmountMinor: number;
  needsReview: boolean;
  reviewReason: string | null;
  updatedAt: string;
};

const paymentStatusFromPrisma: Record<
  StripePaymentStatus,
  StripePaymentAttemptSummary["status"]
> = {
  CREATED: "created",
  OPEN: "open",
  PROCESSING: "processing",
  PAID: "paid",
  FAILED: "failed",
  EXPIRED: "expired",
  PARTIALLY_REFUNDED: "partially-refunded",
  REFUNDED: "refunded",
  DISPUTED: "disputed",
};

function summarizeAttempt(attempt: {
  id: string;
  enrollmentId: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  status: StripePaymentStatus;
  paidAmountMinor: number;
  refundedAmountMinor: number;
  needsReview: boolean;
  reviewReason: string | null;
  updatedAt: Date;
}): StripePaymentAttemptSummary {
  return {
    ...attempt,
    status: paymentStatusFromPrisma[attempt.status],
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

export class CheckoutAttemptError extends Error {
  constructor(
    public readonly code: "not_found" | "not_pending" | "record_mismatch",
    message: string
  ) {
    super(message);
    this.name = "CheckoutAttemptError";
  }
}

type PrepareCheckoutInput = {
  studentId: string;
  enrollmentId: string;
  plan: EnrollmentPlan;
  product: string;
  expectedAmountMinor: number;
  currency: string;
};

const reusableAttemptStatuses = new Set<StripePaymentStatus>([
  StripePaymentStatus.CREATED,
  StripePaymentStatus.OPEN,
  StripePaymentStatus.PROCESSING,
]);

export async function prepareStripeCheckoutAttempt(input: PrepareCheckoutInput) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const enrollment = await transaction.enrollment.findFirst({
        where: { id: input.enrollmentId, studentId: input.studentId },
        include: { student: true },
      });
      if (!enrollment) {
        throw new CheckoutAttemptError("not_found", "Enrollment not found.");
      }
      if (enrollment.status !== EnrollmentStatus.PENDING) {
        throw new CheckoutAttemptError(
          "not_pending",
          "This enrollment is no longer awaiting payment."
        );
      }
      if (
        enrollment.plan !== input.plan ||
        enrollment.product !== input.product ||
        enrollment.amount * 100 !== input.expectedAmountMinor ||
        enrollment.currency.toLowerCase() !== input.currency
      ) {
        throw new CheckoutAttemptError(
          "record_mismatch",
          "The enrollment no longer matches the payment catalog."
        );
      }

      const existing = await transaction.stripePaymentAttempt.findUnique({
        where: { activeKey: enrollment.id },
      });
      if (existing && reusableAttemptStatuses.has(existing.status)) {
        return { attempt: existing, enrollment };
      }
      if (existing) {
        await transaction.stripePaymentAttempt.update({
          where: { id: existing.id },
          data: { activeKey: null },
        });
      }

      const attempt = await transaction.stripePaymentAttempt.create({
        data: {
          enrollmentId: enrollment.id,
          activeKey: enrollment.id,
          expectedAmountMinor: input.expectedAmountMinor,
          currency: input.currency,
        },
      });
      return { attempt, enrollment };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const [concurrentAttempt, enrollment] = await Promise.all([
        prisma.stripePaymentAttempt.findUnique({ where: { activeKey: input.enrollmentId } }),
        prisma.enrollment.findFirst({
          where: { id: input.enrollmentId, studentId: input.studentId },
          include: { student: true },
        }),
      ]);
      if (concurrentAttempt && enrollment) return { attempt: concurrentAttempt, enrollment };
    }
    throw error;
  }
}

export async function attachStripeCheckoutSession(input: {
  attemptId: string;
  checkoutSessionId: string;
  stripeCreatedAt: Date;
}) {
  const attempt = await prisma.stripePaymentAttempt.findUnique({ where: { id: input.attemptId } });
  if (!attempt) throw new CheckoutAttemptError("not_found", "Payment attempt not found.");
  if (attempt.checkoutSessionId && attempt.checkoutSessionId !== input.checkoutSessionId) {
    throw new CheckoutAttemptError(
      "record_mismatch",
      "The payment attempt is already linked to another Checkout Session."
    );
  }
  return prisma.stripePaymentAttempt.update({
    where: { id: attempt.id },
    data: {
      checkoutSessionId: input.checkoutSessionId,
      stripeCreatedAt: input.stripeCreatedAt,
      status: StripePaymentStatus.OPEN,
    },
  });
}

export async function releaseStripeCheckoutAttempt(
  attemptId: string,
  status: typeof StripePaymentStatus.EXPIRED | typeof StripePaymentStatus.FAILED
): Promise<void> {
  await prisma.stripePaymentAttempt.updateMany({
    where: {
      id: attemptId,
      status: {
        in: [
          StripePaymentStatus.CREATED,
          StripePaymentStatus.OPEN,
          StripePaymentStatus.PROCESSING,
        ],
      },
    },
    data: { status, activeKey: null },
  });
}

export async function listLatestStripePaymentAttempts(
  enrollmentIds: string[]
): Promise<Map<string, StripePaymentAttemptSummary>> {
  if (!enrollmentIds.length || !process.env.DATABASE_URL) return new Map();
  const attempts = await prisma.stripePaymentAttempt.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    orderBy: { updatedAt: "desc" },
  });
  const latest = new Map<string, StripePaymentAttemptSummary>();
  for (const attempt of attempts) {
    if (!latest.has(attempt.enrollmentId)) {
      latest.set(attempt.enrollmentId, summarizeAttempt(attempt));
    }
  }
  return latest;
}
