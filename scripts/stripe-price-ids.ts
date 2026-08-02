/**
 * Print the Price behind every Payment Link on the account, so the two values
 * for STRIPE_PRICE_CERTIFICATE and STRIPE_PRICE_ADVANCED can be copied without
 * clicking through the Stripe Dashboard.
 *
 * Run with: STRIPE_SECRET_KEY=sk_test_... npm run stripe:prices
 */

import Stripe from "stripe";

import { PRICING } from "../lib/curriculum";
import { STRIPE_API_VERSION } from "../lib/payments/stripe-version";

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!secretKey) {
  console.error("Set STRIPE_SECRET_KEY before running this script.");
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });

/** The catalog amounts the app validates every Checkout Session against. */
const expected = new Map<number, string>([
  [PRICING.certificate.amount * 100, "STRIPE_PRICE_CERTIFICATE"],
  [PRICING.advanced.amount * 100, "STRIPE_PRICE_ADVANCED"],
]);

const links = await stripe.paymentLinks.list({ limit: 100 });
if (!links.data.length) {
  console.log("No Payment Links found on this account.");
}

for (const link of links.data) {
  const lineItems = await stripe.paymentLinks.listLineItems(link.id, { limit: 10 });
  for (const item of lineItems.data) {
    const price = item.price;
    if (!price) continue;
    const amountMinor = price.unit_amount ?? 0;
    const variable = expected.get(amountMinor);
    const amount = (amountMinor / 100).toLocaleString("en-US", {
      style: "currency",
      currency: price.currency.toUpperCase(),
      maximumFractionDigits: 0,
    });

    console.log(`\n${link.url}`);
    console.log(`  ${item.description ?? "(no description)"} — ${amount} ${price.type}`);
    console.log(`  price id: ${price.id}`);
    console.log(
      variable
        ? `  matches the catalog → ${variable}="${price.id}"`
        : "  does not match either catalog amount in curriculum.json"
    );
  }
}

console.log(
  "\nCheckout also requires the price to be active, one-time, and in USD. " +
    "Set the two variables above in Vercel, never in a committed file."
);
