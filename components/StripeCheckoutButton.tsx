"use client";

import { useFormStatus } from "react-dom";

export default function StripeCheckoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn primary lg stripe-checkout-button"
      disabled={pending}
      aria-label={pending ? "Opening secure Stripe Checkout" : "Pay securely with Stripe"}
    >
      <span>{pending ? "Opening secure checkout…" : "Pay securely"}</span>
      <small>{pending ? "Please wait" : "Card, wallet, or available local method"}</small>
    </button>
  );
}

