import "server-only";

import {
  initialiseTransaction,
  PaystackNotConfiguredError,
} from "@/lib/payments/paystack-client";
import { isPaystackAvailableFor, nairaAmountMinor } from "@/lib/payments/paystack";
import {
  markAttemptOpen,
  preparePaystackAttempt,
  releaseAttempt,
} from "@/lib/payments/paystack-store";

export type PaystackCheckoutResult =
  | { kind: "checkout"; url: string }
  | { kind: "unavailable" };

/**
 * Starts a naira payment and hands back the Paystack hosted page.
 *
 * The amount comes from server-owned pricing, never from the browser, and the
 * enrollment id travels in metadata so a transaction can be traced back even if
 * the reference is lost.
 */
export async function createPaystackCheckout(input: {
  studentId: string;
  enrollment: { id: string; plan: "certificate" | "advanced" };
}): Promise<PaystackCheckoutResult> {
  if (!isPaystackAvailableFor(input.enrollment.plan)) return { kind: "unavailable" };

  const amountMinor = nairaAmountMinor(input.enrollment.plan);
  const { attempt, enrollment } = await preparePaystackAttempt({
    studentId: input.studentId,
    enrollmentId: input.enrollment.id,
    expectedAmountMinor: amountMinor,
  });

  try {
    const initialised = await initialiseTransaction({
      email: enrollment.student.email,
      amountMinor: attempt.expectedAmountMinor,
      reference: attempt.reference,
      metadata: {
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        plan: enrollment.plan,
      },
    });
    await markAttemptOpen(attempt.id);
    return { kind: "checkout", url: initialised.authorization_url };
  } catch (error) {
    // Free the active key so the student can try again rather than being stuck
    // behind an attempt that never reached Paystack.
    await releaseAttempt(attempt.id).catch(() => {});
    if (error instanceof PaystackNotConfiguredError) return { kind: "unavailable" };
    throw error;
  }
}
