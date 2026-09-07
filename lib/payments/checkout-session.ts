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
    // Link can surface a phone number saved on a separate Stripe consumer account.
    // KTI does not collect phone numbers, so use ordinary Checkout payment methods.
    wallet_options: { link: { display: "never" } },
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
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    submit_type: "pay",
  };
}

export function checkoutSessionSuppressesLink(
  session: Pick<Stripe.Checkout.Session, "wallet_options">
): boolean {
  return session.wallet_options?.link?.display === "never";
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
