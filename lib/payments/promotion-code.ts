import "server-only";

import Stripe from "stripe";

export class PromotionCodeError extends Error {
  constructor(message = "That full-tuition promotion code is not available.") {
    super(message);
    this.name = "PromotionCodeError";
  }
}

export type NoCostPromotion = {
  id: string;
  code: string;
};

function rejectPromotion(): never {
  throw new PromotionCodeError();
}

/**
 * Resolve only a promotion that makes this exact enrollment free. Stripe stays
 * authoritative for expiry and redemption limits, while these checks ensure a
 * different or partially discounted code can never be presented as no-cost.
 */
export async function resolveNoCostPromotion(input: {
  stripe: Stripe;
  code: string;
  productId: string;
  amountMinor: number;
  currency: string;
  liveMode: boolean;
  now?: number;
}): Promise<NoCostPromotion> {
  const code = input.code.trim();
  const matches = await input.stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
    expand: ["data.promotion.coupon"],
  });
  const promotion = matches.data[0];
  if (!promotion || promotion.code.toLowerCase() !== code.toLowerCase()) rejectPromotion();

  const couponReference = promotion.promotion.coupon;
  const coupon =
    typeof couponReference === "string"
      ? await input.stripe.coupons.retrieve(couponReference)
      : couponReference;
  if (!coupon || ("deleted" in coupon && coupon.deleted)) rejectPromotion();

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const appliesToProduct =
    !coupon.applies_to || coupon.applies_to.products.includes(input.productId);
  const withinPromotionLimit =
    promotion.max_redemptions === null ||
    promotion.times_redeemed < promotion.max_redemptions;
  const minimumAmountSatisfied =
    promotion.restrictions.minimum_amount === null ||
    (promotion.restrictions.minimum_amount_currency?.toLowerCase() ===
      input.currency.toLowerCase() &&
      input.amountMinor >= promotion.restrictions.minimum_amount);

  if (
    !promotion.active ||
    promotion.livemode !== input.liveMode ||
    (promotion.expires_at !== null && promotion.expires_at <= now) ||
    !withinPromotionLimit ||
    promotion.customer !== null ||
    promotion.customer_account !== null ||
    promotion.restrictions.first_time_transaction ||
    !minimumAmountSatisfied ||
    !coupon.valid ||
    coupon.percent_off !== 100 ||
    coupon.amount_off !== null ||
    (coupon.redeem_by !== null && coupon.redeem_by <= now) ||
    !appliesToProduct
  ) {
    rejectPromotion();
  }

  return { id: promotion.id, code: promotion.code };
}
