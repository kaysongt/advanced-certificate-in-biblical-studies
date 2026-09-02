"use client";

import { useFormStatus } from "react-dom";

export default function StripeCheckoutButton({
  purpose = "payment",
}: {
  purpose?: "payment" | "promotion";
}) {
  const { pending } = useFormStatus();
  const promotion = purpose === "promotion";
  return (
    <button
      type="submit"
      className={promotion ? "promo-code-submit" : "btn primary lg stripe-checkout-button"}
      disabled={pending}
      aria-label={
        pending
          ? promotion
            ? "Applying promotion code"
            : "Opening secure Stripe Checkout"
          : promotion
            ? "Apply full-tuition promotion code"
            : "Pay securely with Stripe"
      }
    >
      {promotion ? (
        pending ? "Checking…" : "Apply code"
      ) : (
        <>
          <span>{pending ? "Opening secure checkout…" : "Pay securely"}</span>
          <small>{pending ? "Please wait" : "Card, wallet, or available local method"}</small>
        </>
      )}
    </button>
  );
}
