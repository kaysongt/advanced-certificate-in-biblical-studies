import { isPaystackConfigured, verifyWebhookSignature } from "@/lib/payments/paystack";
import { settleTransaction } from "@/lib/payments/paystack-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackEvent = {
  event: string;
  data: {
    id: number;
    reference: string;
    status: string;
    amount: number;
    currency: string;
    channel: string | null;
    paid_at: string | null;
  };
};

/**
 * Paystack's server-to-server notification. This is the authority on payment,
 * not the browser callback: a student can close the tab before being redirected
 * back, and the money still needs to open their access.
 *
 * Always answers 200 once the signature checks out. Paystack retries non-2xx,
 * and a retry loop over an event we have already recorded helps nobody.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isPaystackConfigured()) {
    return Response.json({ error: "Paystack is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-paystack-signature"))) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return Response.json({ error: "Malformed payload." }, { status: 400 });
  }

  if (!event?.data?.reference) {
    return Response.json({ received: true, outcome: "ignored" });
  }

  // charge.success is the one that matters; the failure events keep the
  // attempt record honest so staff can see what happened.
  if (!["charge.success", "charge.failed", "charge.abandoned"].includes(event.event)) {
    return Response.json({ received: true, outcome: "ignored" });
  }

  const outcome = await settleTransaction({
    reference: event.data.reference,
    transactionId: event.data.id,
    status: event.event === "charge.success" ? "success" : event.data.status,
    amountMinor: event.data.amount,
    currency: event.data.currency,
    channel: event.data.channel,
    paidAt: event.data.paid_at ? new Date(event.data.paid_at) : null,
  });

  return Response.json({ received: true, outcome });
}
