import type { Plan } from "@/lib/db/types";

/**
 * The approved launch promotion: $100 off the full program only. Stripe holds
 * the code itself; this module holds the ceiling the server enforces, so a code
 * edited in the Stripe Dashboard can never discount more than was approved here.
 */
export const FULL_PROGRAM_DISCOUNT_MINOR = 10_000;

/** Single certificates are never discounted, so Checkout hides the code field. */
export function promotionCodesAllowed(plan: Plan): boolean {
  return plan === "advanced";
}

export function maxDiscountMinor(plan: Plan): number {
  return promotionCodesAllowed(plan) ? FULL_PROGRAM_DISCOUNT_MINOR : 0;
}

/** What the student actually owes: catalog price less the recorded discount. */
export function chargeableAmountMinor(attempt: {
  expectedAmountMinor: number;
  discountAmountMinor: number;
}): number {
  return Math.max(0, attempt.expectedAmountMinor - attempt.discountAmountMinor);
}

/** A discount is only honoured when the plan allows one and it stays in bounds. */
export function isAcceptedDiscount(plan: Plan, discountMinor: number): boolean {
  return (
    Number.isInteger(discountMinor) &&
    discountMinor >= 0 &&
    discountMinor <= maxDiscountMinor(plan)
  );
}
