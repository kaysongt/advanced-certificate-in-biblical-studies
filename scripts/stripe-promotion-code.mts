/**
 * Create (or report) the 100%-off promotion code for the full program. A
 * student who redeems it owes nothing, so Checkout completes without a charge.
 *
 * The coupon is restricted to the product behind STRIPE_PRICE_ADVANCED, so the
 * code cannot discount a single certificate even if someone types it there. The
 * server enforces the same ceiling again in lib/payments/promotions.ts.
 *
 * Run with:
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ADVANCED=price_... \
 *   PROMO_CODE=ORDAINEDMINISTERS2026 PROMO_MAX_REDEMPTIONS=50 \
 *   PROMO_EXPIRES_ON=2026-12-31 npm run stripe:promo
 *
 * Both limits are required, because the code gives tuition away outright. Pass
 * PROMO_MAX_REDEMPTIONS=unlimited or PROMO_EXPIRES_ON=never to opt out of one,
 * so an uncapped free-tuition code can only ever be created on purpose.
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
      .default("ORDAINEDMINISTERS2026")
      .transform((value) => value.toUpperCase()),
    // Required, not optional: a forgotten variable must never be the reason a
    // free-tuition code ends up uncapped. Opting out has to be spelled out.
    PROMO_MAX_REDEMPTIONS: z
      .string({ error: "Required. Use a positive whole number, or `unlimited`." })
      .regex(/^(unlimited|[1-9]\d*)$/, "Use a positive whole number, or `unlimited`."),
    PROMO_EXPIRES_ON: z
      .string({ error: "Required. Use YYYY-MM-DD, or `never`." })
      .regex(/^(never|\d{4}-\d{2}-\d{2})$/, "Use YYYY-MM-DD, or `never`."),
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

const maxRedemptions =
  config.PROMO_MAX_REDEMPTIONS === "unlimited" ? null : Number(config.PROMO_MAX_REDEMPTIONS);
const expiresOn = config.PROMO_EXPIRES_ON === "never" ? null : config.PROMO_EXPIRES_ON;

if (maxRedemptions === null && expiresOn === null) {
  console.warn(
    "Warning: this code will be uncapped and will never expire. Every person who receives"
  );
  console.warn(
    "or forwards it enrols free, and there is no charge to refund afterwards. Deactivate it"
  );
  console.warn("in the Stripe Dashboard the moment the offer ends.\n");
}

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

// The coupon zeroes the whole line, so the server ceiling has to allow the
// entire catalog price. Refuse to create a code the webhook would then reject.
if (FULL_PROGRAM_DISCOUNT_MINOR < advancedAmountMinor) {
  console.error(
    `FULL_PROGRAM_DISCOUNT_MINOR is ${FULL_PROGRAM_DISCOUNT_MINOR}, below the $${PRICING.advanced.amount} catalog price.`
  );
  console.error(
    "Raise it in lib/payments/promotions.ts and deploy, or the webhook will refuse every redemption."
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

// percent_off rather than a flat amount, so the code keeps clearing the whole
// balance if tuition is ever repriced. Stripe forbids `currency` alongside it.
const coupon = await stripe.coupons.create({
  name: "100% off the Advanced Certificate",
  percent_off: 100,
  duration: "once",
  applies_to: { products: [productId] },
});

let promotionCode: Stripe.PromotionCode;
try {
  promotionCode = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: config.PROMO_CODE,
    ...(maxRedemptions === null ? {} : { max_redemptions: maxRedemptions }),
    ...(expiresOn === null
      ? {}
      : { expires_at: Math.floor(Date.parse(`${expiresOn}T23:59:59Z`) / 1000) }),
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
console.log("  discount: 100% off the full program only");
console.log(`  students pay: $0 instead of $${PRICING.advanced.amount}`);
console.log(
  `  redemptions: ${maxRedemptions ?? "unlimited"}; expires: ${expiresOn ?? "never"}`
);
console.log("  students may type the code in any capitalisation");
console.log("\nShare the code with students. No redeploy is needed.");
