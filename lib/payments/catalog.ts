import { getModule, PRICING } from "@/lib/curriculum";
import type { Enrollment, Plan } from "@/lib/db/types";

type CatalogEnrollment = Pick<Enrollment, "amount" | "currency" | "plan" | "product">;

export type StripeCatalogItem = {
  key: Plan;
  title: string;
  amountMajor: number;
  amountMinor: number;
  currency: "usd";
  priceEnvironmentVariable: "STRIPE_PRICE_ADVANCED" | "STRIPE_PRICE_CERTIFICATE";
};

export class PaymentCatalogError extends Error {
  constructor(
    public readonly code: "invalid_product" | "stored_price_mismatch",
    message: string
  ) {
    super(message);
    this.name = "PaymentCatalogError";
  }
}

/** Resolve payment facts from server-owned curriculum and pricing, never browser input. */
export function getStripeCatalogItem(
  enrollment: CatalogEnrollment
): StripeCatalogItem {
  const price = enrollment.plan === "advanced" ? PRICING.advanced : PRICING.certificate;
  let title: string;

  if (enrollment.plan === "advanced") {
    if (enrollment.product !== "advanced") {
      throw new PaymentCatalogError("invalid_product", "The full-program enrollment is invalid.");
    }
    title = "Advanced Certificate in Biblical Studies";
  } else {
    const module = getModule(enrollment.product);
    if (!module) {
      throw new PaymentCatalogError("invalid_product", "The certificate enrollment is invalid.");
    }
    title = `${module.short_title} Certificate`;
  }

  if (enrollment.amount !== price.amount || enrollment.currency.toUpperCase() !== price.currency) {
    throw new PaymentCatalogError(
      "stored_price_mismatch",
      "The enrollment price does not match the current catalog."
    );
  }

  return {
    key: enrollment.plan,
    title,
    amountMajor: price.amount,
    amountMinor: price.amount * 100,
    currency: "usd",
    priceEnvironmentVariable:
      enrollment.plan === "advanced" ? "STRIPE_PRICE_ADVANCED" : "STRIPE_PRICE_CERTIFICATE",
  };
}
