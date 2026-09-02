import "server-only";

import Stripe from "stripe";

import { getStripeCatalogItem } from "@/lib/payments/catalog";
import {
  buildCheckoutSessionParams,
  checkoutSessionHasPromotion,
} from "@/lib/payments/checkout-session";
import {
  getStripeCheckoutConfiguration,
  getStripeClient,
} from "@/lib/payments/stripe-client";
import {
  attachStripeCheckoutSession,
  prepareStripeCheckoutAttempt,
  releaseStripeCheckoutAttempt,
} from "@/lib/payments/stripe-store";
import {
  PromotionCodeError,
  resolveNoCostPromotion,
} from "@/lib/payments/promotion-code";
import { EnrollmentPlan, StripePaymentStatus } from "@prisma/client";

export type CheckoutResult =
  | { kind: "checkout"; url: string }
  | { kind: "dashboard"; reason: "already-completed" };

function enrollmentPlan(plan: "certificate" | "advanced"): EnrollmentPlan {
  return plan === "advanced" ? EnrollmentPlan.ADVANCED : EnrollmentPlan.CERTIFICATE;
}

export async function createCheckoutForEnrollment(input: {
  studentId: string;
  enrollment: {
    id: string;
    plan: "certificate" | "advanced";
    product: string;
    amount: number;
    currency: string;
  };
  promotionCode?: string;
}): Promise<CheckoutResult> {
  const config = getStripeCheckoutConfiguration();
  const stripe = getStripeClient();
  const catalog = getStripeCatalogItem(input.enrollment);
  const priceId =
    catalog.key === "advanced" ? config.advancedPriceId : config.certificatePriceId;
  const stripePrice = await stripe.prices.retrieve(priceId);
  if (
    !stripePrice.active ||
    stripePrice.type !== "one_time" ||
    stripePrice.currency.toLowerCase() !== catalog.currency ||
    stripePrice.unit_amount !== catalog.amountMinor
  ) {
    throw new Error("The configured Stripe Price does not match the enrollment catalog.");
  }

  if (input.promotionCode && catalog.key !== "advanced") {
    throw new PromotionCodeError();
  }
  const productId =
    typeof stripePrice.product === "string" ? stripePrice.product : stripePrice.product.id;
  const promotion = input.promotionCode
    ? await resolveNoCostPromotion({
        stripe,
        code: input.promotionCode,
        productId,
        amountMinor: catalog.amountMinor,
        currency: catalog.currency,
        liveMode: config.mode === "live",
      })
    : null;

  // A terminal attempt releases its active key, so one retry can create a fresh Session.
  for (let attemptNumber = 0; attemptNumber < 2; attemptNumber += 1) {
    const { attempt, enrollment } = await prepareStripeCheckoutAttempt({
      studentId: input.studentId,
      enrollmentId: input.enrollment.id,
      plan: enrollmentPlan(input.enrollment.plan),
      product: input.enrollment.product,
      expectedAmountMinor: catalog.amountMinor,
      currency: catalog.currency,
    });

    if (attempt.checkoutSessionId) {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(
          attempt.checkoutSessionId
        );
        if (existingSession.status === "open" && existingSession.url) {
          if (!promotion || checkoutSessionHasPromotion(existingSession, promotion.id)) {
            return { kind: "checkout", url: existingSession.url };
          }

          // Do not send a code holder back to an earlier full-price Session.
          await stripe.checkout.sessions.expire(existingSession.id);
          await releaseStripeCheckoutAttempt(attempt.id, StripePaymentStatus.EXPIRED);
          continue;
        }
        if (existingSession.status === "complete") {
          return { kind: "dashboard", reason: "already-completed" };
        }
        await releaseStripeCheckoutAttempt(attempt.id, StripePaymentStatus.EXPIRED);
        continue;
      } catch (error) {
        if (
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.code === "resource_missing"
        ) {
          await releaseStripeCheckoutAttempt(attempt.id, StripePaymentStatus.FAILED);
          continue;
        }
        throw error;
      }
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        buildCheckoutSessionParams({
          enrollmentId: enrollment.id,
          paymentAttemptId: attempt.id,
          catalogKey: catalog.key,
          customerEmail: enrollment.student.email,
          priceId,
          appBaseUrl: config.appBaseUrl,
          promotionCodeId: promotion?.id,
        }),
        { idempotencyKey: `kti-checkout:${attempt.id}` }
      );
    } catch (error) {
      if (promotion && error instanceof Stripe.errors.StripeInvalidRequestError) {
        await releaseStripeCheckoutAttempt(attempt.id, StripePaymentStatus.FAILED);
        throw new PromotionCodeError();
      }
      throw error;
    }

    // This route promises a no-payment checkout. Refuse the redirect if Stripe
    // did not actually reduce the order to zero for any reason.
    if (promotion && session.amount_total !== 0) {
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      await releaseStripeCheckoutAttempt(attempt.id, StripePaymentStatus.FAILED);
      throw new PromotionCodeError();
    }
    if (!session.url) throw new Error("Stripe did not return a hosted Checkout URL.");

    await attachStripeCheckoutSession({
      attemptId: attempt.id,
      checkoutSessionId: session.id,
      stripeCreatedAt: new Date(session.created * 1000),
    });
    return { kind: "checkout", url: session.url };
  }

  throw new Error("A new Stripe Checkout Session could not be created.");
}
