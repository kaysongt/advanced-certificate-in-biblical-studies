# Production launch runbook

The launch product is **Module I: Systematic Theology** with Stripe-hosted Checkout and bank
transfer as a manual fallback. The public
site, accounts, gated lessons, progress, server-verified quizzes, written assessment
submission, staff grading, community moderation, and staff-awarded engagement credits are
implemented in the Next.js application.

## 1. Create the production database

Provision PostgreSQL with Vercel Postgres, Neon, Supabase, or another managed provider.
Copy its pooled production connection string into `DATABASE_URL`.

Apply the committed schema once before accepting registrations:

```bash
DATABASE_URL="postgresql://..." npm run db:deploy
```

The app uses the JSON file adapter only when `DATABASE_URL` is absent. That adapter is for
local development and must never be used for production enrollment.

## 2. Configure production environment variables

Set these in Vercel for Production and Preview:

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | Durable PostgreSQL connection |
| `SESSION_SECRET` | Yes | Signs 30-day secure session cookies |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical metadata and social links |
| `APP_BASE_URL` | Yes | Trusted origin for Stripe success and cancel redirects |
| `STRIPE_MODE` | For online payment | `test` during verification, then `live` at launch |
| `STRIPE_SECRET_KEY` | For online payment | Server-only Stripe API credential |
| `STRIPE_WEBHOOK_SECRET` | For online payment | Verifies signed events at `/api/stripe/webhook` |
| `STRIPE_PRICE_CERTIFICATE` | For online payment | Stripe Price ID for the $250 certificate |
| `STRIPE_PRICE_ADVANCED` | For online payment | Stripe Price ID for the $1,000 program |

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Use a different secret in production from any local value. Rotating it signs everyone out.

## 3. Create the first administrator

Put the production database URL and temporary admin values in `.env.local`, then run:

```bash
npm run admin:create
```

Required temporary values are `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Optional display values
are documented in `.env.example`. Remove the admin password from the environment after the
account is created. Staff access is role-based; matching the public contact email alone does
not grant staff privileges.

## 4. Deploy on Vercel

1. Import `kaysongt/advanced-certificate-in-biblical-studies` at <https://vercel.com/new>.
2. Use the repository root and the detected Next.js framework settings.
3. Add the environment variables before the first production deploy.
4. Deploy. Every later push to `main` creates a production deployment.

`vercel.json` uses `npm ci`, applies committed Prisma migrations, and then runs `next build`.
Prisma Client is generated during install.

## 5. Configure Stripe Checkout

Start in a Stripe sandbox/test environment. Do not use a secret key that has appeared in chat,
email, source control, command history, or logs; rotate it first.

1. In Stripe, create two one-time USD Prices: **Single Certificate** for `$250.00` and
   **Advanced Certificate in Biblical Studies** for `$1,000.00`.
2. Put the resulting test Price IDs in `STRIPE_PRICE_CERTIFICATE` and
   `STRIPE_PRICE_ADVANCED` in Vercel. If those Prices already exist behind Payment Links,
   run `STRIPE_SECRET_KEY=sk_test_... npm run stripe:prices` to print each link's Price ID
   and which variable it belongs in.
3. Add the rotated test secret as `STRIPE_SECRET_KEY`, set `STRIPE_MODE=test`, and set
   `APP_BASE_URL=https://www.thekti.org`.
4. In Stripe Workbench, create a webhook destination at
   `https://www.thekti.org/api/stripe/webhook` for:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
   `charge.dispute.created`, and `charge.dispute.closed`.
5. Put that destination's signing secret in `STRIPE_WEBHOOK_SECRET` in Vercel.
6. Redeploy, register a fresh test student, and complete payment with a Stripe test card.
7. Confirm the signed webhook changes the exact pending enrollment to active and that `/admin`
   shows the payment state. The success redirect alone must never activate access.

Stripe-hosted Checkout does not need a publishable key in this application because no payment
form or card data is rendered on the KingsWord site.

## 5a. Create the $100-off promotion code

The full program accepts a promotion code at Checkout. Single certificates do not, so the code
field is hidden on those Sessions. Create the code once per Stripe environment:

```bash
STRIPE_SECRET_KEY=sk_test_... \
STRIPE_PRICE_ADVANCED=price_... \
PROMO_CODE=SUMMERBLAST2026 \
npm run stripe:promo
```

`PROMO_MAX_REDEMPTIONS` and `PROMO_EXPIRES_ON=YYYY-MM-DD` are optional limits. Re-running with
an existing code reports it instead of creating a duplicate.

Stripe matches promotion codes without regard to case, so a student may type
`summerblast2026`, `SUMMERBLAST2026`, or any mix and it will be accepted. The script stores the
code upper case only so it reads clearly in the Stripe Dashboard and on `/admin`.

The script restricts the coupon to the product behind `STRIPE_PRICE_ADVANCED` and sets a
minimum order amount, so the code cannot discount a single certificate. Independently, the
webhook rejects any Session whose discount exceeds `FULL_PROGRAM_DISCOUNT_MINOR` in
`lib/payments/promotions.ts`, or whose pre-discount subtotal is not the catalog price. Raising
the discount in the Stripe Dashboard alone will not activate access — that constant must be
changed and deployed too.

Because Checkout lets a student type any active code, **every promotion code created on this
Stripe account must be restricted to a specific product**, the way `npm run stripe:promo`
restricts this one. An unrestricted code created later in the Dashboard could be typed on the
full program. The webhook still refuses to activate access for a discount over the approved
ceiling, but that leaves a captured payment for staff to refund by hand — so restrict the
coupon when you create it rather than relying on the ceiling.

The code is not printed anywhere on the public site. Share it directly with the people meant to
use it. Test it end to end before announcing it: apply the code at Checkout, confirm the total
falls to $900, pay with a test card, and confirm the webhook activates the enrollment and that
`/admin` shows the promotion line on that registration. Repeat the refund test on a discounted
payment — a $900 refund must read as fully refunded, not partial.

## 6. Attach the domain

The application uses `https://www.thekti.org` as its canonical fallback. Keep both
`thekti.org` and `www.thekti.org` attached in Vercel, with the apex domain redirecting to
`www.thekti.org`. Set `NEXT_PUBLIC_SITE_URL=https://www.thekti.org` in production and preview.

## 7. Test the real enrollment path

Before announcing:

1. Register a non-staff test student.
2. Confirm the dashboard shows a pending enrollment and no course access.
3. Sign out and sign back in. Once the Stripe variables above are set, an unpaid student must
   land on `/dashboard?payment=required` even when a `next` destination was requested, and any
   course, assessment, or community URL must bounce back to the same payment prompt. Without
   those variables the sign-in redirect is skipped, so a configuration gap cannot lock students
   out of a site they have no way to pay on.
4. Complete Stripe test Checkout and confirm webhook activation. Repeat with a canceled Session,
   declined card, delayed method, duplicate webhook, refund, dispute, and a promotion-code test.
5. Separately test bank transfer by signing in as staff, opening `/admin`, and activating a
   pending enrollment with the verified bank reference.
6. Confirm Module I access, topic sequencing, the 80% pass requirement, saved progress,
   assessment submission, staff grading, community posting, moderation, and extra credits.
7. Test on a phone, desktop, and a slow connection.

## Launch boundaries

- Open modules on the published schedule: Systematic Theology on September 1, 2026; Biblical Foundations on November 1, 2026; Old Testament Survey on January 1, 2027; New Testament Survey on March 1, 2027; and Spiritual Formation on May 1, 2027.
- The $1,000 full-program option is a scheduled-release reservation, not immediate access to
  all five certificates.
- Stripe-hosted Checkout activates access only from signed, idempotently processed webhooks.
  Bank transfer and staff activation remain available as an audited fallback.
- Certificate issuance remains staff-controlled until the final grading weights, module
  assignment rule, certificate wording, and signer are approved.
- Opening and closing video slots are ready, but the actual video URLs must be supplied.

## Release checks

```bash
npm ci
npm run check
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```

The former GitHub Pages workflow has been removed. GitHub Pages only serves static files and
cannot run the production account, enrollment, grading, or community features. Disable Pages
in the repository settings after the Vercel domain is working.
