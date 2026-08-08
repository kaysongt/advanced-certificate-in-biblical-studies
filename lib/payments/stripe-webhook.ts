import "server-only";

import {
  EnrollmentStatus,
  Prisma,
  StripePaymentStatus,
} from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db/prisma";
import type { Plan } from "@/lib/db/types";
import { getStripeCatalogItem } from "@/lib/payments/catalog";
import {
  blocksLatePaymentActivation,
  refundPaymentStatus,
  wonDisputePaymentStatus,
} from "@/lib/payments/payment-policy";
import { chargeableAmountMinor } from "@/lib/payments/promotions";
import { sessionAmountIssues } from "@/lib/payments/session-amounts";
import { getStripeClient } from "@/lib/payments/stripe-client";

type Transaction = Prisma.TransactionClient;
type AttemptWithEnrollment = Prisma.StripePaymentAttemptGetPayload<{
  include: { enrollment: true };
}>;

export type StripeWebhookResult = {
  duplicate: boolean;
  result: "processed" | "ignored" | "review" | "unlinked";
};

const sessionEventTypes = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

function stripeObjectId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function eventDate(event: Stripe.Event): Date {
  return new Date(event.created * 1000);
}

function newestDate(current: Date | null, candidate: Date): Date {
  return current && current > candidate ? current : candidate;
}

function eventPayload(
  event: Stripe.Event,
  objectId: string,
  result: StripeWebhookResult["result"]
): Prisma.InputJsonObject {
  return {
    eventId: event.id,
    eventType: event.type,
    objectId,
    livemode: event.livemode,
    result,
  };
}

async function findAttempt(
  transaction: Transaction,
  input: {
    attemptId?: string | null;
    checkoutSessionId?: string | null;
    paymentIntentId?: string | null;
    chargeId?: string | null;
  }
): Promise<AttemptWithEnrollment | null> {
  const filters: Prisma.StripePaymentAttemptWhereInput[] = [];
  if (input.attemptId) filters.push({ id: input.attemptId });
  if (input.checkoutSessionId) filters.push({ checkoutSessionId: input.checkoutSessionId });
  if (input.paymentIntentId) filters.push({ paymentIntentId: input.paymentIntentId });
  if (input.chargeId) filters.push({ latestChargeId: input.chargeId });
  if (!filters.length) return null;
  return transaction.stripePaymentAttempt.findFirst({
    where: { OR: filters },
    include: { enrollment: true },
  });
}

async function externalIdConflicts(
  transaction: Transaction,
  attemptId: string,
  paymentIntentId: string | null,
  chargeId: string | null
): Promise<boolean> {
  const filters: Prisma.StripePaymentAttemptWhereInput[] = [];
  if (paymentIntentId) filters.push({ paymentIntentId });
  if (chargeId) filters.push({ latestChargeId: chargeId });
  if (!filters.length) return false;
  return Boolean(
    await transaction.stripePaymentAttempt.findFirst({
      where: { id: { not: attemptId }, OR: filters },
      select: { id: true },
    })
  );
}

async function recordEvent(
  transaction: Transaction,
  event: Stripe.Event,
  objectId: string,
  result: StripeWebhookResult["result"]
): Promise<void> {
  await transaction.paymentEvent.create({
    data: {
      provider: "stripe",
      providerRef: event.id,
      eventType: event.type,
      eventCreatedAt: eventDate(event),
      processingResult: result,
      payload: eventPayload(event, objectId, result),
    },
  });
}

/**
 * The readable code staff will recognise. Stripe only guarantees the id on the
 * Session, so the lookup degrades to that id rather than failing the event.
 */
async function resolvePromotionLabel(
  session: Stripe.Checkout.Session
): Promise<string | null> {
  const promotionCode = session.discounts?.[0]?.promotion_code;
  if (!promotionCode) return null;
  if (typeof promotionCode !== "string") return promotionCode.code;
  try {
    return (await getStripeClient().promotionCodes.retrieve(promotionCode)).code;
  } catch {
    return promotionCode;
  }
}

async function processSessionEvent(
  transaction: Transaction,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  promotionLabel: string | null
): Promise<StripeWebhookResult["result"]> {
  const metadataAttemptId = session.metadata?.paymentAttemptId ?? null;
  const metadataEnrollmentId = session.metadata?.enrollmentId ?? null;
  const paymentIntent =
    session.payment_intent && typeof session.payment_intent !== "string"
      ? session.payment_intent
      : null;
  const paymentIntentId = stripeObjectId(session.payment_intent);
  const latestChargeId = stripeObjectId(paymentIntent?.latest_charge);
  const attempt = await findAttempt(transaction, {
    attemptId: metadataAttemptId,
    checkoutSessionId: session.id,
    paymentIntentId,
    chargeId: latestChargeId,
  });
  if (!attempt) return "unlinked";

  const plan: Plan = attempt.enrollment.plan === "ADVANCED" ? "advanced" : "certificate";
  const issues: string[] = [];
  try {
    getStripeCatalogItem({
      plan,
      product: attempt.enrollment.product,
      amount: attempt.enrollment.amount,
      currency: attempt.enrollment.currency,
    });
  } catch {
    issues.push("catalog mismatch");
  }

  // A promotion code may lower the total, so the catalog price is verified
  // against the pre-discount subtotal and the discount is bounded separately.
  const discountMinor = session.total_details?.amount_discount ?? 0;
  const chargeableMinor = attempt.expectedAmountMinor - discountMinor;
  const lineItems = session.line_items?.data ?? [];
  const lineItem = lineItems[0];
  if (metadataAttemptId !== attempt.id) issues.push("attempt metadata mismatch");
  if (metadataEnrollmentId !== attempt.enrollmentId) issues.push("enrollment metadata mismatch");
  if (session.client_reference_id !== attempt.enrollmentId) issues.push("client reference mismatch");
  if (attempt.checkoutSessionId && attempt.checkoutSessionId !== session.id) {
    issues.push("Checkout Session mismatch");
  }
  if (session.mode !== "payment") issues.push("invalid Checkout mode");
  issues.push(
    ...sessionAmountIssues({
      plan,
      expectedAmountMinor: attempt.expectedAmountMinor,
      recordedDiscountMinor: attempt.discountAmountMinor,
      attemptCurrency: attempt.currency,
      sessionCurrency: session.currency,
      amountSubtotal: session.amount_subtotal,
      amountTotal: session.amount_total,
      discountMinor,
      taxMinor: session.total_details?.amount_tax ?? 0,
      shippingMinor: session.total_details?.amount_shipping ?? 0,
      lineItemCount: lineItems.length,
      lineQuantity: lineItem?.quantity ?? null,
      lineAmountSubtotal: lineItem?.amount_subtotal ?? null,
      lineAmountDiscount: lineItem?.amount_discount ?? null,
      lineAmountTax: lineItem?.amount_tax ?? null,
      lineAmountTotal: lineItem?.amount_total ?? null,
      paymentStatusPaid: session.payment_status === "paid",
      amountReceived: paymentIntent?.amount_received ?? null,
    })
  );
  if (paymentIntent && paymentIntent.metadata.paymentAttemptId !== attempt.id) {
    issues.push("PaymentIntent attempt mismatch");
  }
  if (paymentIntent && paymentIntent.metadata.enrollmentId !== attempt.enrollmentId) {
    issues.push("PaymentIntent enrollment mismatch");
  }
  if (
    await externalIdConflicts(transaction, attempt.id, paymentIntentId, latestChargeId)
  ) {
    issues.push("Stripe object already belongs to another attempt");
  }

  if (issues.length) {
    await transaction.stripePaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        needsReview: true,
        reviewReason: `Webhook validation failed: ${issues.join(", ")}`,
        lastEventCreatedAt: newestDate(attempt.lastEventCreatedAt, eventDate(event)),
      },
    });
    return "review";
  }

  const commonData = {
    checkoutSessionId: session.id,
    paymentIntentId,
    latestChargeId,
    discountAmountMinor: discountMinor,
    promotionCode: promotionLabel ?? attempt.promotionCode,
    lastEventCreatedAt: newestDate(attempt.lastEventCreatedAt, eventDate(event)),
  };

  if (session.payment_status === "paid") {
    if (blocksLatePaymentActivation(attempt.status)) {
      await transaction.stripePaymentAttempt.update({
        where: { id: attempt.id },
        data: {
          ...commonData,
          activeKey: null,
          paidAmountMinor: session.amount_total ?? attempt.paidAmountMinor,
          needsReview: true,
          reviewReason: "A paid Checkout event arrived after a refund or dispute.",
        },
      });
      return "review";
    }

    const otherPaidAttempt = await transaction.stripePaymentAttempt.findFirst({
      where: {
        enrollmentId: attempt.enrollmentId,
        id: { not: attempt.id },
        status: {
          in: [
            StripePaymentStatus.PAID,
            StripePaymentStatus.PARTIALLY_REFUNDED,
            StripePaymentStatus.DISPUTED,
          ],
        },
      },
      select: { id: true },
    });
    const activatedElsewhere =
      attempt.enrollment.status === EnrollmentStatus.ACTIVE &&
      (attempt.enrollment.provider !== "stripe" ||
        attempt.enrollment.providerRef !== session.id);
    const needsReview = Boolean(otherPaidAttempt || activatedElsewhere);

    await transaction.stripePaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        ...commonData,
        activeKey: null,
        status: StripePaymentStatus.PAID,
        paidAmountMinor: session.amount_total ?? chargeableMinor,
        needsReview,
        reviewReason: needsReview
          ? "Payment succeeded after another payment or manual activation."
          : null,
      },
    });

    if (attempt.enrollment.status === EnrollmentStatus.PENDING) {
      await transaction.enrollment.update({
        where: { id: attempt.enrollmentId },
        data: {
          status: EnrollmentStatus.ACTIVE,
          provider: "stripe",
          providerRef: session.id,
          activatedAt: new Date(),
          accessSuspendedAt: null,
        },
      });
    }
    return needsReview ? "review" : "processed";
  }

  if (event.type === "checkout.session.async_payment_failed") {
    if (!blocksLatePaymentActivation(attempt.status) && attempt.status !== StripePaymentStatus.PAID) {
      await transaction.stripePaymentAttempt.update({
        where: { id: attempt.id },
        data: { ...commonData, activeKey: null, status: StripePaymentStatus.FAILED },
      });
    }
    return "processed";
  }

  if (session.status === "expired" || event.type === "checkout.session.expired") {
    if (!blocksLatePaymentActivation(attempt.status) && attempt.status !== StripePaymentStatus.PAID) {
      await transaction.stripePaymentAttempt.update({
        where: { id: attempt.id },
        data: { ...commonData, activeKey: null, status: StripePaymentStatus.EXPIRED },
      });
    }
    return "processed";
  }

  if (!blocksLatePaymentActivation(attempt.status) && attempt.status !== StripePaymentStatus.PAID) {
    await transaction.stripePaymentAttempt.update({
      where: { id: attempt.id },
      data: { ...commonData, status: StripePaymentStatus.PROCESSING },
    });
  }
  return "processed";
}

async function processRefundEvent(
  transaction: Transaction,
  event: Stripe.Event,
  charge: Stripe.Charge,
  paymentIntentMetadata: Stripe.Metadata | null
): Promise<StripeWebhookResult["result"]> {
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  const attempt = await findAttempt(transaction, {
    attemptId: charge.metadata.paymentAttemptId ?? paymentIntentMetadata?.paymentAttemptId,
    paymentIntentId,
    chargeId: charge.id,
  });
  if (!attempt) return "unlinked";
  if (
    (charge.metadata.paymentAttemptId && charge.metadata.paymentAttemptId !== attempt.id) ||
    (paymentIntentMetadata?.paymentAttemptId &&
      paymentIntentMetadata.paymentAttemptId !== attempt.id) ||
    (charge.metadata.enrollmentId && charge.metadata.enrollmentId !== attempt.enrollmentId) ||
    (paymentIntentMetadata?.enrollmentId &&
      paymentIntentMetadata.enrollmentId !== attempt.enrollmentId) ||
    (await externalIdConflicts(transaction, attempt.id, paymentIntentId, charge.id))
  ) {
    await transaction.stripePaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        needsReview: true,
        reviewReason: "Refund event identifiers did not match the payment attempt.",
        lastEventCreatedAt: newestDate(attempt.lastEventCreatedAt, eventDate(event)),
      },
    });
    return "review";
  }

  // A discounted enrollment is fully refunded at the amount actually charged.
  const chargeableMinor = chargeableAmountMinor(attempt);
  const fullyRefunded = charge.amount_refunded >= chargeableMinor;
  const manualActivation =
    attempt.enrollment.status === EnrollmentStatus.ACTIVE &&
    attempt.enrollment.provider !== "stripe";
  await transaction.stripePaymentAttempt.update({
    where: { id: attempt.id },
    data: {
      activeKey: null,
      paymentIntentId,
      latestChargeId: charge.id,
      refundedAmountMinor: charge.amount_refunded,
      status: refundPaymentStatus(charge.amount_refunded, chargeableMinor),
      needsReview: !fullyRefunded || manualActivation,
      reviewReason: !fullyRefunded
        ? "A partial refund requires staff review."
        : manualActivation
          ? "A Stripe refund followed a manual activation."
          : null,
      lastEventCreatedAt: newestDate(attempt.lastEventCreatedAt, eventDate(event)),
    },
  });

  if (
    fullyRefunded &&
    (attempt.enrollment.status === EnrollmentStatus.PENDING ||
      (attempt.enrollment.status === EnrollmentStatus.ACTIVE &&
        attempt.enrollment.provider === "stripe" &&
        attempt.enrollment.providerRef === attempt.checkoutSessionId))
  ) {
    await transaction.enrollment.update({
      where: { id: attempt.enrollmentId },
      data: { status: EnrollmentStatus.REFUNDED, accessSuspendedAt: null },
    });
  }
  return !fullyRefunded || manualActivation ? "review" : "processed";
}

async function processDisputeEvent(
  transaction: Transaction,
  event: Stripe.Event,
  dispute: Stripe.Dispute,
  paymentIntentMetadata: Stripe.Metadata | null
): Promise<StripeWebhookResult["result"]> {
  const paymentIntentId = stripeObjectId(dispute.payment_intent);
  const chargeId = stripeObjectId(dispute.charge);
  const attempt = await findAttempt(transaction, {
    attemptId: paymentIntentMetadata?.paymentAttemptId,
    paymentIntentId,
    chargeId,
  });
  if (!attempt) return "unlinked";
  if (
    (paymentIntentMetadata?.paymentAttemptId &&
      paymentIntentMetadata.paymentAttemptId !== attempt.id) ||
    (paymentIntentMetadata?.enrollmentId &&
      paymentIntentMetadata.enrollmentId !== attempt.enrollmentId) ||
    (await externalIdConflicts(transaction, attempt.id, paymentIntentId, chargeId))
  ) {
    await transaction.stripePaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        needsReview: true,
        reviewReason: "Dispute identifiers did not match the payment attempt.",
        lastEventCreatedAt: newestDate(attempt.lastEventCreatedAt, eventDate(event)),
      },
    });
    return "review";
  }

  const won = event.type === "charge.dispute.closed" && dispute.status === "won";
  const chargeableMinor = chargeableAmountMinor(attempt);
  const fullyRefunded = attempt.refundedAmountMinor >= chargeableMinor;
  const status = won
    ? wonDisputePaymentStatus(attempt.refundedAmountMinor, chargeableMinor)
    : StripePaymentStatus.DISPUTED;
  await transaction.stripePaymentAttempt.update({
    where: { id: attempt.id },
    data: {
      activeKey: null,
      paymentIntentId,
      latestChargeId: chargeId,
      status,
      disputeStatus: dispute.status,
      needsReview: !won,
      reviewReason: won ? null : `Stripe dispute status: ${dispute.status}.`,
      lastEventCreatedAt: newestDate(attempt.lastEventCreatedAt, eventDate(event)),
    },
  });

  const ownsStripeActivation =
    attempt.enrollment.status === EnrollmentStatus.ACTIVE &&
    attempt.enrollment.provider === "stripe" &&
    attempt.enrollment.providerRef === attempt.checkoutSessionId;
  if (ownsStripeActivation) {
    await transaction.enrollment.update({
      where: { id: attempt.enrollmentId },
      data: { accessSuspendedAt: won && !fullyRefunded ? null : new Date() },
    });
  }
  return won ? "processed" : "review";
}

async function withIdempotentEvent(
  event: Stripe.Event,
  objectId: string,
  handler: (transaction: Transaction) => Promise<StripeWebhookResult["result"]>
): Promise<StripeWebhookResult> {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.paymentEvent.findUnique({
          where: { provider_providerRef: { provider: "stripe", providerRef: event.id } },
          select: { id: true },
        });
        if (existing) return { duplicate: true, result: "ignored" as const };

        const result = await handler(transaction);
        await recordEvent(transaction, event, objectId, result);
        return { duplicate: false, result };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.paymentEvent.findUnique({
        where: { provider_providerRef: { provider: "stripe", providerRef: event.id } },
        select: { id: true },
      });
      if (existing) return { duplicate: true, result: "ignored" };
    }
    throw error;
  }
}

async function paymentIntentMetadata(paymentIntentId: string | null): Promise<Stripe.Metadata | null> {
  if (!paymentIntentId) return null;
  const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId);
  return paymentIntent.metadata;
}

export async function processStripeWebhookEvent(
  event: Stripe.Event
): Promise<StripeWebhookResult> {
  if (sessionEventTypes.has(event.type)) {
    const eventSession = event.data.object as Stripe.Checkout.Session;
    const session = await getStripeClient().checkout.sessions.retrieve(eventSession.id, {
      expand: ["line_items", "payment_intent.latest_charge"],
    });
    const promotionLabel = await resolvePromotionLabel(session);
    return withIdempotentEvent(event, session.id, (transaction) =>
      processSessionEvent(transaction, event, session, promotionLabel)
    );
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const metadata = await paymentIntentMetadata(stripeObjectId(charge.payment_intent));
    return withIdempotentEvent(event, charge.id, (transaction) =>
      processRefundEvent(transaction, event, charge, metadata)
    );
  }

  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    const metadata = await paymentIntentMetadata(stripeObjectId(dispute.payment_intent));
    return withIdempotentEvent(event, dispute.id, (transaction) =>
      processDisputeEvent(transaction, event, dispute, metadata)
    );
  }

  const object = event.data.object as { id?: string };
  return withIdempotentEvent(event, object.id ?? "unknown", async () => "ignored");
}
