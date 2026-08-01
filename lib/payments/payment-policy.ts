import { StripePaymentStatus } from "@prisma/client";

const adverseStatuses = new Set<StripePaymentStatus>([
  StripePaymentStatus.PARTIALLY_REFUNDED,
  StripePaymentStatus.REFUNDED,
  StripePaymentStatus.DISPUTED,
]);

/** Refunds and disputes dominate a stale or out-of-order success notification. */
export function blocksLatePaymentActivation(status: StripePaymentStatus): boolean {
  return adverseStatuses.has(status);
}

export function refundPaymentStatus(
  refundedAmountMinor: number,
  expectedAmountMinor: number
): typeof StripePaymentStatus.REFUNDED | typeof StripePaymentStatus.PARTIALLY_REFUNDED {
  return refundedAmountMinor >= expectedAmountMinor
    ? StripePaymentStatus.REFUNDED
    : StripePaymentStatus.PARTIALLY_REFUNDED;
}

export function wonDisputePaymentStatus(
  refundedAmountMinor: number,
  expectedAmountMinor: number
): typeof StripePaymentStatus.PAID | typeof StripePaymentStatus.REFUNDED {
  return refundedAmountMinor >= expectedAmountMinor
    ? StripePaymentStatus.REFUNDED
    : StripePaymentStatus.PAID;
}

