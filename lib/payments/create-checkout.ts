import "server-only";

import Stripe from "stripe";

import { getStripeCatalogItem } from "@/lib/payments/catalog";
import { buildCheckoutSessionParams } from "@/lib/payments/checkout-session";
import {
  getStripeCheckoutConfiguration,
  getStripeClient,
} from "@/lib/payments/stripe-client";
import {
  attachStripeCheckoutSession,
  prepareStripeCheckoutAttempt,
  releaseStripeCheckoutAttempt,
} from "@/lib/payments/stripe-store";
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
}): Promise<CheckoutResult> {
  const config = getStripeCheckoutConfiguration();
  const stripe = getStripeClient();
  const catalog = getStripeCatalogItem(input.enrollment, { requireAvailableCertificate: true });
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
          return { kind: "checkout", url: existingSession.url };
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

    const session = await stripe.checkout.sessions.create(
      buildCheckoutSessionParams({
        enrollmentId: enrollment.id,
        paymentAttemptId: attempt.id,
        catalogKey: catalog.key,
        customerEmail: enrollment.student.email,
        priceId,
        appBaseUrl: config.appBaseUrl,
      }),
      { idempotencyKey: `kti-checkout:${attempt.id}` }
    );
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
