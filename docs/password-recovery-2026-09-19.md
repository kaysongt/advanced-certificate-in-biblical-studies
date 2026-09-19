# Password recovery — September 19, 2026

## Change

The sign-in page previously offered only an email link to KTI support. It now links to `/forgot-password`, which emails a thirty-minute, single-use reset link through the existing Resend integration. `/reset-password` accepts a matching new password of 10–200 characters and returns to sign-in with confirmation.

Tokens are random, signed, and bound to the account's current password hash. Atomic compare-and-set prevents concurrent reuse. Every password change revokes older sessions; account roles and enrollments are unchanged. Persistent, pseudonymized email/IP counters limit requests. Existing and nonexistent accounts receive the same response before account lookup and sending. Reset pages use no-referrer, no-store, and noindex headers.

## Configuration

Production requires `DATABASE_URL`, `SESSION_SECRET`, and `RESEND_API_KEY`. The sender uses optional `PASSWORD_RESET_FROM`, then `PAYMENT_REMINDER_FROM`, then `KingsWord Training Institute <reminders@thekti.org>`. The sending domain must be verified with Resend. Links use the configured canonical HTTPS application origin; replies go to `kti@kingsword.org`.

Migration `20260919190000_password_recovery` adds only a nullable password-change timestamp and a rate-limit table. It was tested on an isolated Neon branch before being applied to production. No real user's password was changed.

## Verification

- 168 regression checks passed; lint, TypeScript, and production build passed.
- Isolated PostgreSQL integration verified concurrent redemption, persistent limits, password replacement, and role preservation; synthetic rows were removed.
- Browser verification with a local-only mail capture exercised request, emailed link, reset, confirmation, old-password rejection, old-session revocation, replay rejection, and administrator sign-in with the new password.
- Desktop and 390px mobile layouts checked; no mobile horizontal overflow.
- Local fixture data restored to its original SHA-256 hash; temporary email mock removed.

At implementation time, live email delivery remained unverified because the saved Vercel CLI login had expired. Do not treat local mocked delivery as production delivery evidence. Check production configuration and an actual received email before announcing recovery as fully operational.

## Payment status

The application integrates Stripe Checkout in USD and a manually verified bank-transfer fallback. Bank details depend on production settings; otherwise students contact KTI for instructions. Approved scholarship/full-tuition-code access remains available. Paystack is not connected. This change does not claim a new live card transaction was completed.
