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
}): Stripe.Checkout.SessionCreateParams {
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
    // Only the full program carries an approved discount, so the code field is
    // hidden on single certificates rather than rejected after it is typed.
    ...(promotionCodesAllowed(input.catalogKey) ? { allow_promotion_codes: true } : {}),
    metadata,
    payment_intent_data: { metadata },
    success_url: `${input.appBaseUrl}/dashboard?payment=success`,
    cancel_url: `${input.appBaseUrl}/dashboard?payment=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    submit_type: "pay",
  };
}
