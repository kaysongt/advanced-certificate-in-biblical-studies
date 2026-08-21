"use client";

import { useFormStatus } from "react-dom";

/**
 * Naira checkout, shown first for students in Nigeria. Names the amount on the
 * button because it differs from the dollar tuition shown above it.
 */
export default function PaystackCheckoutButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn primary lg stripe-checkout-button"
      disabled={pending}
      aria-label={pending ? "Opening Paystack" : `Pay ${label} with Paystack`}
    >
      <span>{pending ? "Opening Paystack…" : `Pay ${label}`}</span>
      <small>{pending ? "Please wait" : "Naira card, bank transfer, or USSD"}</small>
    </button>
  );
}
