# KTI administration

Sign in with your own account, then open `/admin`. Administrators and staff can
manage registrations, review scholarship applications, grade submitted work,
and moderate community posts. Only administrators can change roles or reset
another person's password.

## Accounts and settings

Open `/admin/settings` to search by name, email, or role. Results are paginated.
Choose an access level and save it to change permissions. You cannot change your
own role. Password resets take effect immediately; share replacement passwords
securely with the account owner. No reset email is sent automatically.

The service cards indicate whether configuration exists, not whether a payment
or email has been delivered. Database access is verified while loading accounts.
Production uses the existing PostgreSQL database and Prisma migrations. Never
substitute the local JSON development store for production storage.

## Scholarships

Open `/admin/scholarships`, filter by status, or search name, email, and country.
Pending requests appear first. Review the complete financial-need and training-goal
responses before deciding. Approval grants full tuition and activates the pending
enrollment; declining leaves the student's payment option available.

The download button exports **all** applications, regardless of current filters,
as an Excel-compatible CSV. It includes private responses and staff notes, but
never passwords. Only authenticated staff or administrators can download it.
Keep exports private and verify recipients before sharing financial information.

## Tuition summary

Activated tuition value is the catalog tuition remaining after known scholarships
and discounts. It is not a bank reconciliation or Stripe payout balance. Reconcile
receipts, refunds, fees, and taxes with payment-provider and bank records.

## Deployment checks

Run `npm run typecheck`, `npm run lint`, `npm run check`, and `npm run build`.
After deployment, verify admin sign-in, scholarship search, and exports. Signed-out
exports must return 401; student exports must return 403. Never test scholarship
approval or password resets against a real applicant without authorization.
