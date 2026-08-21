import { redirect } from "next/navigation";

import { verifyTransaction } from "@/lib/payments/paystack-client";
import { isPaystackConfigured } from "@/lib/payments/paystack";
import { settleTransaction } from "@/lib/payments/paystack-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Paystack returns the student's browser after payment.
 *
 * The reference in the URL is not trusted on its own — it is verified against
 * Paystack before anything is recorded. The webhook covers the case where the
 * student never makes it back here, and settlement is idempotent so whichever
 * arrives first wins and the second is a no-op.
 */
export async function GET(request: Request): Promise<Response> {
  const reference = new URL(request.url).searchParams.get("reference");
  if (!reference || !isPaystackConfigured()) {
    redirect("/dashboard?payment=invalid");
  }

  try {
    const transaction = await verifyTransaction(reference);
    const outcome = await settleTransaction({
      reference: transaction.reference,
      transactionId: transaction.id,
      status: transaction.status,
      amountMinor: transaction.amount,
      currency: transaction.currency,
      channel: transaction.channel,
      paidAt: transaction.paid_at ? new Date(transaction.paid_at) : null,
    });

    if (transaction.status !== "success") redirect("/dashboard?payment=cancelled");
    if (outcome === "review") redirect("/dashboard?payment=processing");
    redirect("/dashboard?payment=success");
  } catch (error) {
    // redirect() works by throwing, so its signal must pass through untouched.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    redirect("/dashboard?payment=processing");
  }
}
