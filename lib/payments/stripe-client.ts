import "server-only";

import Stripe from "stripe";

import { STRIPE_API_VERSION } from "@/lib/payments/stripe-version";

type StripeMode = "test" | "live";

type StripeCoreConfiguration = {
  secretKey: string;
  webhookSecret: string;
  mode: StripeMode;
};

export type StripeCheckoutConfiguration = StripeCoreConfiguration & {
  appBaseUrl: string;
  certificatePriceId: string;
  advancedPriceId: string;
};

export class StripeConfigurationError extends Error {
  constructor(message = "Stripe Checkout is not configured.") {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new StripeConfigurationError();
  return value;
}

function stripeMode(): StripeMode {
  const value = process.env.STRIPE_MODE?.trim().toLowerCase();
  if (value !== "test" && value !== "live") throw new StripeConfigurationError();
  return value;
}

function validateKeyMode(secretKey: string, mode: StripeMode): void {
  const keySaysLive = secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_");
  const keySaysTest = secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_");
  if ((keySaysLive && mode !== "live") || (keySaysTest && mode !== "test")) {
    throw new StripeConfigurationError("The Stripe key mode does not match STRIPE_MODE.");
  }
}

export function getStripeCoreConfiguration(): StripeCoreConfiguration {
  const mode = stripeMode();
  const secretKey = requiredEnvironmentValue("STRIPE_SECRET_KEY");
  const webhookSecret = requiredEnvironmentValue("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret.startsWith("whsec_")) throw new StripeConfigurationError();
  validateKeyMode(secretKey, mode);
  return { secretKey, webhookSecret, mode };
}

function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  const fallback = process.env.NODE_ENV === "production" ? "" : "http://localhost:3000";
  const value = configured || fallback;
  if (!value) throw new StripeConfigurationError();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new StripeConfigurationError("APP_BASE_URL must be an absolute URL.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new StripeConfigurationError("APP_BASE_URL must use HTTPS in production.");
  }
  return url.origin;
}

export function getStripeCheckoutConfiguration(): StripeCheckoutConfiguration {
  if (!process.env.DATABASE_URL) throw new StripeConfigurationError();
  const core = getStripeCoreConfiguration();
  const certificatePriceId = requiredEnvironmentValue("STRIPE_PRICE_CERTIFICATE");
  const advancedPriceId = requiredEnvironmentValue("STRIPE_PRICE_ADVANCED");
  if (!certificatePriceId.startsWith("price_") || !advancedPriceId.startsWith("price_")) {
    throw new StripeConfigurationError();
  }
  return {
    ...core,
    appBaseUrl: appBaseUrl(),
    certificatePriceId,
    advancedPriceId,
  };
}

export function isStripeCheckoutConfigured(): boolean {
  try {
    getStripeCheckoutConfiguration();
    return true;
  } catch {
    return false;
  }
}

let stripeClient: Stripe | null = null;
let stripeClientKey: string | null = null;

export function getStripeClient(): Stripe {
  const { secretKey } = getStripeCoreConfiguration();
  if (!stripeClient || stripeClientKey !== secretKey) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 2,
      appInfo: {
        name: "KingsWord Training Institute",
        url: "https://www.thekti.org",
      },
    });
    stripeClientKey = secretKey;
  }
  return stripeClient;
}
