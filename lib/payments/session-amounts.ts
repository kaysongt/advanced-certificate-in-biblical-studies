import type { Plan } from "@/lib/db/types";
import { isAcceptedDiscount } from "@/lib/payments/promotions";

/**
 * Every money fact a Checkout Session must agree on, pulled out of the Stripe
 * object so the arithmetic can be exercised directly by `npm run check`.
 */
export type SessionAmountFacts = {
  plan: Plan;
  /** Catalog price before any discount, from the payment attempt. */
  expectedAmountMinor: number;
  /** Discount already recorded against this attempt, or 0 the first time. */
  recordedDiscountMinor: number;
  attemptCurrency: string;
  sessionCurrency: string | null;
  amountSubtotal: number | null;
  amountTotal: number | null;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  lineItemCount: number;
  lineQuantity: number | null;
  lineAmountSubtotal: number | null;
  lineAmountDiscount: number | null;
  lineAmountTax: number | null;
  lineAmountTotal: number | null;
  paymentStatusPaid: boolean;
  amountReceived: number | null;
};

/**
 * Tax is allowed to raise the total because Stripe Tax can be switched on in
 * the Dashboard without a deploy. What may never move is the catalog price:
 * it is checked against the pre-discount subtotal, and the discount is capped
 * by the approved promotion. Shipping is always wrong for a course.
 */
export function sessionAmountIssues(facts: SessionAmountFacts): string[] {
  const issues: string[] = [];
  const chargeableMinor = facts.expectedAmountMinor - facts.discountMinor;
  const expectedTotal = chargeableMinor + facts.taxMinor;

  if (facts.sessionCurrency?.toLowerCase() !== facts.attemptCurrency) {
    issues.push("currency mismatch");
  }
  if (!isAcceptedDiscount(facts.plan, facts.discountMinor)) {
    issues.push("discount outside the approved promotion");
  }
  if (facts.recordedDiscountMinor && facts.recordedDiscountMinor !== facts.discountMinor) {
    issues.push("recorded discount mismatch");
  }
  if (facts.shippingMinor) issues.push("unexpected shipping");
  if (facts.taxMinor < 0) issues.push("negative tax");
  if (chargeableMinor <= 0) issues.push("non-positive charge");
  if (facts.amountSubtotal !== facts.expectedAmountMinor) issues.push("subtotal mismatch");
  if (facts.amountTotal !== expectedTotal) issues.push("amount mismatch");
  if (facts.lineItemCount !== 1 || facts.lineQuantity !== 1) issues.push("line item mismatch");
  if (facts.lineAmountSubtotal !== facts.expectedAmountMinor) issues.push("line subtotal mismatch");
  if (facts.lineAmountDiscount !== facts.discountMinor) issues.push("line discount mismatch");
  if ((facts.lineAmountTax ?? 0) !== facts.taxMinor) issues.push("line tax mismatch");
  if (facts.lineAmountTotal !== expectedTotal) issues.push("line amount mismatch");
  if (facts.paymentStatusPaid && facts.amountReceived !== expectedTotal) {
    issues.push("received amount mismatch");
  }

  return issues;
}
