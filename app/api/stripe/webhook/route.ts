import type Stripe from "stripe";

import { getStripeClient, getStripeCoreConfiguration } from "@/lib/payments/stripe-client";
import { processStripeWebhookEvent } from "@/lib/payments/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });

  let configuration: ReturnType<typeof getStripeCoreConfiguration>;
  try {
    configuration = getStripeCoreConfiguration();
  } catch {
    return Response.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      configuration.webhookSecret
    );
  } catch {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const expectedLivemode = configuration.mode === "live";
  if (event.livemode !== expectedLivemode) {
    return Response.json({ error: "Unexpected Stripe mode." }, { status: 400 });
  }

  try {
    const result = await processStripeWebhookEvent(event);
    return Response.json({ received: true, ...result });
  } catch (error) {
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
