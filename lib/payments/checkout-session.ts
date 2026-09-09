import { createHash } from "node:crypto";
import Stripe from "stripe";

import { promotionCodesAllowed } from "@/lib/payments/promotions";
import type { Plan } from "@/lib/db/types";

export function buildCheckoutSessionParams(input: {
  enrollmentId: string;
  paymentAttemptId: string;
  catalogKey: Plan;
  customerEmail: string;
  priceId: string;
  appBaseUrl: string;
  promotionCodeId?: string;
}): Stripe.Checkout.SessionCreateParams {
  if (input.promotionCodeId && !promotionCodesAllowed(input.catalogKey)) {
    throw new Error("Promotion codes are not available for this enrollment.");
  }

  const metadata = {
    enrollmentId: input.enrollmentId,
    paymentAttemptId: input.paymentAttemptId,
    catalogKey: input.catalogKey,
  };

  return {
    mode: "payment",
    client_reference_id: input.enrollmentId,
    customer_email: input.customerEmail,
    line_items: [{ price: input.priceId, quantity: 1 }],
    // Managed Payments controls wallets; suppressing Link rejects the whole Session.
    // A code entered on the KTI dashboard is attached before Checkout opens.
    // Stripe then renders a no-cost order instead of requesting payment details.
    ...(input.promotionCodeId
      ? { discounts: [{ promotion_code: input.promotionCodeId }] }
      : promotionCodesAllowed(input.catalogKey)
        ? { allow_promotion_codes: true }
        : {}),
    metadata,
    payment_intent_data: { metadata },
    success_url: `${input.appBaseUrl}/dashboard?payment=success`,
    cancel_url: `${input.appBaseUrl}/dashboard?payment=cancelled`,
    // Use Stripe's default expiry so retries do not change request parameters.
    submit_type: "pay",
  };
}

export function checkoutSessionIdempotencyKey(
  attemptId: string,
  params: Stripe.Checkout.SessionCreateParams
): string {
  // Separate changed promo/configuration requests from earlier rejected requests.
  // Identical retries (including after a network timeout) retain the same key.
  const fingerprint = createHash("sha256").update(JSON.stringify(params)).digest("hex");
  return `kti-checkout:v2:${attemptId}:${fingerprint}`;
}

export function checkoutSessionHasPromotion(
  session: Pick<Stripe.Checkout.Session, "discounts">,
  promotionCodeId: string
): boolean {
  return Boolean(
    session.discounts?.some((discount) => {
      const promotionCode = discount.promotion_code;
      return (
        promotionCode === promotionCodeId ||
        (typeof promotionCode === "object" && promotionCode?.id === promotionCodeId)
      );
    })
  );
}
