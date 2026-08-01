# Production launch runbook

The launch product is **Module I: Systematic Theology** with direct invoicing. The public
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

`vercel.json` uses `npm ci` and `next build`. Prisma Client is generated during install.

## 5. Attach the domain

The application uses `https://www.thekti.org` as its canonical fallback. Keep both
`thekti.org` and `www.thekti.org` attached in Vercel, with the apex domain redirecting to
`www.thekti.org`. Set `NEXT_PUBLIC_SITE_URL=https://www.thekti.org` in production and preview.

## 6. Test the real enrollment path

Before announcing:

1. Register a non-staff test student.
2. Confirm the dashboard shows a pending enrollment and no course access.
3. Send and mark a test invoice as paid.
4. Sign in as staff, open `/admin`, and activate the enrollment with the invoice reference.
5. Confirm Module I access, topic sequencing, the 80% pass requirement, saved progress,
   assessment submission, staff grading, community posting, moderation, and extra credits.
6. Test on a phone, desktop, and a slow connection.

## Launch boundaries

- Sell Module I as available now. Modules II through V still contain authoring placeholders.
- The $1,000 full-program option is a scheduled-release reservation, not immediate access to
  all five certificates.
- Direct invoicing is operational. Stripe or Paystack automation can be added after the
  receiving merchant entity is confirmed.
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
