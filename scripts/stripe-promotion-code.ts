/**
 * Create (or report) the $100-off promotion code for the full program.
 *
 * The coupon is restricted to the product behind STRIPE_PRICE_ADVANCED, so the
 * code cannot discount a single certificate even if someone types it there. The
 * server enforces the same ceiling again in lib/payments/promotions.ts.
 *
 * Run with:
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ADVANCED=price_... \
 *   PROMO_CODE=SUMMERBLAST2026 npm run stripe:promo
 *
 * Optional: PROMO_MAX_REDEMPTIONS, PROMO_EXPIRES_ON (YYYY-MM-DD).
 * Re-running with the same code reports the existing one instead of duplicating it.
 *
 * Stripe matches codes without regard to case, so students may type the code in
 * any capitalisation. It is stored upper case here only so staff read it easily.
 */

import Stripe from "stripe";
import { z } from "zod";

import { PRICING } from "../lib/curriculum";
import { FULL_PROGRAM_DISCOUNT_MINOR } from "../lib/payments/promotions";
import { STRIPE_API_VERSION } from "../lib/payments/stripe-version";

const input = z
  .object({
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_PRICE_ADVANCED: z.string().startsWith("price_"),
    PROMO_CODE: z
      .string()
      .regex(/^[A-Za-z0-9-]{4,40}$/, "Use 4-40 letters, digits, or dashes.")
      .default("SUMMERBLAST2026")
      .transform((value) => value.toUpperCase()),
    PROMO_MAX_REDEMPTIONS: z.coerce.number().int().positive().optional(),
    PROMO_EXPIRES_ON: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
      .optional(),
  })
  .safeParse(process.env);

if (!input.success) {
  console.error("Invalid configuration:");
  for (const issue of input.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const config = input.data;
const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
const advancedAmountMinor = PRICING.advanced.amount * 100;

const price = await stripe.prices.retrieve(config.STRIPE_PRICE_ADVANCED);
if (
  !price.active ||
  price.type !== "one_time" ||
  price.currency.toLowerCase() !== "usd" ||
  price.unit_amount !== advancedAmountMinor
) {
  console.error(
    `STRIPE_PRICE_ADVANCED must be an active one-time USD price of $${PRICING.advanced.amount}.`
  );
  process.exit(1);
}

const productId = typeof price.product === "string" ? price.product : price.product.id;

const existing = await stripe.promotionCodes.list({ code: config.PROMO_CODE, limit: 1 });
if (existing.data.length) {
  const found = existing.data[0];
  const couponId =
    typeof found.promotion.coupon === "string"
      ? found.promotion.coupon
      : found.promotion.coupon?.id;
  console.log(`Promotion code ${found.code} already exists (${found.id}).`);
  console.log(`  active: ${found.active}`);
  console.log(`  coupon: ${couponId ?? "none"}`);
  console.log("\nNothing was changed. Delete or deactivate it in Stripe to recreate it.");
  process.exit(0);
}

const coupon = await stripe.coupons.create({
  name: `$${FULL_PROGRAM_DISCOUNT_MINOR / 100} off the Advanced Certificate`,
  amount_off: FULL_PROGRAM_DISCOUNT_MINOR,
  currency: "usd",
  duration: "once",
  applies_to: { products: [productId] },
});

let promotionCode: Stripe.PromotionCode;
try {
  promotionCode = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: config.PROMO_CODE,
    ...(config.PROMO_MAX_REDEMPTIONS ? { max_redemptions: config.PROMO_MAX_REDEMPTIONS } : {}),
    ...(config.PROMO_EXPIRES_ON
      ? { expires_at: Math.floor(Date.parse(`${config.PROMO_EXPIRES_ON}T23:59:59Z`) / 1000) }
      : {}),
    restrictions: {
      minimum_amount: advancedAmountMinor,
      minimum_amount_currency: "usd",
    },
  });
} catch (error) {
  // Leave no orphan coupon behind when the code itself cannot be claimed.
  await stripe.coupons.del(coupon.id).catch(() => undefined);
  console.error(
    `Could not create the promotion code: ${error instanceof Error ? error.message : error}`
  );
  console.error(
    "Stripe treats codes as case-insensitive, so this can mean the code already exists in another capitalisation."
  );
  process.exit(1);
}

console.log(`Created promotion code ${promotionCode.code} (${promotionCode.id}).`);
console.log(`  coupon: ${coupon.id}`);
console.log(`  discount: $${FULL_PROGRAM_DISCOUNT_MINOR / 100} off the full program only`);
console.log(
  `  students pay: $${(advancedAmountMinor - FULL_PROGRAM_DISCOUNT_MINOR) / 100} instead of $${PRICING.advanced.amount}`
);
console.log(
  `  redemptions: ${config.PROMO_MAX_REDEMPTIONS ?? "unlimited"}; expires: ${config.PROMO_EXPIRES_ON ?? "never"}`
);
console.log("  students may type the code in any capitalisation");
console.log("\nShare the code with students. No redeploy is needed.");
