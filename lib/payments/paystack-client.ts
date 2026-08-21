import "server-only";

import { getPaystackConfiguration } from "@/lib/payments/paystack";

/**
 * The two Paystack API calls this app makes.
 *
 * No SDK on purpose: one initialise and one verify is a smaller surface than a
 * dependency. Everything that does not touch the network lives in
 * lib/payments/paystack.ts so it can be tested without a key.
 */

const API = "https://api.paystack.co";

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super("Paystack is not configured.");
    this.name = "PaystackNotConfiguredError";
  }
}

export class PaystackApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "PaystackApiError";
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const config = getPaystackConfiguration();
  if (!config) throw new PaystackNotConfiguredError();

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | { status?: boolean; message?: string; data?: T }
    | null;

  if (!response.ok || !body?.status) {
    throw new PaystackApiError(response.status, body?.message ?? "Paystack request failed.");
  }
  return body.data as T;
}

export type PaystackInitialisation = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export function initialiseTransaction(input: {
  email: string;
  amountMinor: number;
  reference: string;
  metadata: Record<string, string>;
}): Promise<PaystackInitialisation> {
  const config = getPaystackConfiguration();
  if (!config) throw new PaystackNotConfiguredError();

  return call<PaystackInitialisation>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountMinor,
      currency: "NGN",
      reference: input.reference,
      callback_url: config.callbackUrl,
      metadata: input.metadata,
    }),
  });
}

export type PaystackTransaction = {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
};

export function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  return call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });
}
