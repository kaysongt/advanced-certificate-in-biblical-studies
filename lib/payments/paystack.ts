import { createHmac, timingSafeEqual } from "node:crypto";

import { PRICING_NGN } from "@/lib/curriculum";
import type { Plan } from "@/lib/db/types";

/**
 * Paystack rules that do not touch the network, kept out of the server-only
 * client so scripts/check.ts can exercise them. Nothing here is inlined into a
 * browser bundle: Next only exposes NEXT_PUBLIC_* variables, so the secret key
 * reads as undefined on the client.
 */

export type PaystackConfiguration = {
  secretKey: string;
  /** Absolute, because Paystack redirects the browser back to it. */
  callbackUrl: string;
};

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim();
  return (configured || "https://www.thekti.org").replace(/\/$/, "");
}

/** Null rather than throwing, so callers can hide the option when unset. */
export function getPaystackConfiguration(): PaystackConfiguration | null {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return { secretKey, callbackUrl: `${baseUrl()}/api/paystack/callback` };
}

export function isPaystackConfigured(): boolean {
  return getPaystackConfiguration() !== null;
}

/**
 * Naira tuition in kobo. Zero means "not priced yet" and disables Paystack for
 * that plan rather than charging a wrong amount.
 */
export function nairaAmountMinor(plan: Plan): number {
  const price = plan === "advanced" ? PRICING_NGN.advanced : PRICING_NGN.certificate;
  return Math.round(price.amount * 100);
}

export function isPaystackAvailableFor(plan: Plan): boolean {
  return isPaystackConfigured() && nairaAmountMinor(plan) > 0;
}

/** Paystack is offered to students whose account country is Nigeria. */
export function prefersPaystack(country: string | null | undefined): boolean {
  return (country ?? "").trim().toLowerCase() === "nigeria";
}

/**
 * Paystack signs webhooks with HMAC SHA512 of the raw body under the secret
 * key. Compared in constant time, and only after a length check because
 * timingSafeEqual throws on mismatched lengths.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const config = getPaystackConfiguration();
  if (!config || !signature) return false;

  const expected = createHmac("sha512", config.secretKey).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
