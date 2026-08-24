"use client";

import { useFormStatus } from "react-dom";

export default function StripeCheckoutButton({ secondary = false }: { secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn lg stripe-checkout-button ${secondary ? "quiet" : "primary"}`}
      disabled={pending}
      aria-label={pending ? "Opening secure Stripe Checkout" : "Pay securely with Stripe"}
    >
      <span>{pending ? "Opening secure checkout…" : "Pay securely"}</span>
      <small>{pending ? "Please wait" : "Card, wallet, or available local method"}</small>
    </button>
  );
}

