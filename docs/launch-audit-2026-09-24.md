# October 1 launch audit

## Scope and delivery status

Module 1 is the launch target. Modules 2-5 remain scheduled and gated while their authored material is unfinished. The lesson-discussion migration was tested on an isolated Neon branch and applied successfully to production on September 24.

## Implemented

- A separate discussion below each authored lesson, linked from the end of the lesson reader.
- Lesson posts stored with module and lesson identifiers. Existing general-module posts retain a null lesson identifier and remain separate.
- Server checks for sign-in, enrollment, module release, previous-lesson completion, and valid lesson/module membership. Staff can moderate and participate before release.
- Persistent per-account posting limit, server length validation, safe text rendering, and preservation of entered text when submission fails.
- Existing moderation and engagement accounting include lesson contributions. Moderation invalidates the affected lesson page.
- A short course orientation explains quizzes, saving progress, discussion participation, assessment sections, and instructor review.
- Admin payment descriptions distinguish recorded money from a completed zero-cost checkout.
- Missing lesson/course/assessment files no longer count as ready simply because they contain no placeholder tokens.

## Verification

- `npm run check`: 188 checks passed. Production build and TypeScript completed successfully.
- Isolated PostgreSQL test verified lesson/general discussion separation and rolled back all test posts.
- Minister waivers use separate zero-cost enrollments, preserving existing enrollments, payment attempts, scholarships and roles. The operation was tested for conservation and idempotency on the isolated branch.
- Waiver holders do not see payment prompts, cannot start checkout through the dashboard action, and are excluded from payment reminders. Existing external Stripe links are not invalidated by this database change.

- Regression checks cover all six Module 1 banks: at least 40 questions, unique IDs, exactly one correct answer, and two disjoint 20-question attempts from the same course.
- Storage checks cover lesson/module isolation and moderation. Existing authentication, access, scholarship, assessment, payment-policy and release-boundary checks remain in the suite.
- Browser review: homepage, lesson reader, course assessment, and a 390px mobile lesson discussion.
- Browser submission: a local staff contribution persisted and appeared after refresh, but not in a neighboring lesson conversation.
- Authenticated HTTP sweep: all 36 Module 1 lessons and six course assessments render, with no `[FROM BOOK]` text exposed. Public catalog pages and later-module overviews also checked. Login/enrollment/scholarship redirects require browser navigation rather than raw streaming-HTML heading checks.
- No live card charge, production student submission, or production data mutation was performed during these checks.

## Remaining launch requirements

1. Verify the deployed authenticated lesson flow against production. The database migration has been applied.
2. Complete a signed-in production checkout and verify processor confirmation and access activation. A lack of error logs is not payment verification.
3. Configure and verify password-reset email delivery. Current environment inspection has no Resend key.
4. Supply and link the actual student manuals/books; lesson notes and audiobook links do not replace downloadable books.
5. Confirm reviewer account emails before granting pre-launch access. Minister access does not imply administrative privileges.
6. Resolve missing/shared minister email addresses and reconcile exact-email matches against production before applying tuition waivers. Preserve all payment history.

The entire five-module program is not yet launch-complete. Module 1 cannot receive final operational sign-off until the production dependencies and materials above are verified.
