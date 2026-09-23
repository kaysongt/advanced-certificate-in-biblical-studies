# Registration groups

Staff can open `/admin/registrations` and download either the complete, grouped roster or one group. Existing all-registration download buttons use the same report. CSVs keep one row per account, with UTF-8 encoding and formula-injection escaping.

## Classification

Each account has one primary group, in the team's requested order:

1. Scholarship applicants: any recorded application, including pending, approved, or declined.
2. ORDAINEDMINISTERS2026 code: the exact code appears in any stored Stripe checkout attempt (case/whitespace normalized).
3. Paid or attempted payment: recorded checkout/payment activity, manual activation, or a legacy Stripe enrollment with unavailable attempt history.
4. Others: no evidence matching the above, including staff accounts without such activity.

All stored attempts are considered, so a later retry does not erase earlier code usage. Separate columns preserve scholarship status, code status, checkout counts, and payment history even when a higher-priority group wins. All-account downloads sort by group, then newest registration first. Group downloads ignore the current search and pagination and contain the entire selected group.

An open, failed, or expired checkout is not a successful payment. Completed zero-cost checkouts are labeled without payment; received and refunded amounts retain currency; disputes and review flags remain visible. Manual activations are explicitly marked for receipt verification. Active access alone is not evidence of money received. Unknown or rejected code entries that were never stored cannot be reconstructed; the UI explains this limitation.

## Privacy and implementation

Page and export require staff/admin access. Exports return private/no-store, noindex and attachment headers; invalid groups return 400 after authorization. Scholarship grouping queries only student IDs and statuses, not essays or staff notes. Password hashes and processor references are excluded from output. No schema migration, payment-provider call, or account/payment mutation is required.

## Verification

Regression cases cover precedence/overlap, all scholarship statuses, all checkout states, historical code use, zero-cost completion, refunds, manual activation, multiple enrollments, orphan attempts, safe CSV cells, and private scholarship summaries. Local HTTP checks cover anonymous/student denial, staff/admin access, all/group exports, ignored search/page parameters, invalid groups and empty groups. Browser checks cover admin sign-in, group selection, search persistence, a real download click, and desktop/mobile rendering. Temporary local accounts were removed by restoring the original store with its SHA-256 hash verified.
