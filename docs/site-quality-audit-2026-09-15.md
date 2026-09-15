# Site quality audit — September 15, 2026

## Outcome

A full-site usability and functional review was performed across the public catalog, enrollment, scholarships, student learning, assessments, community, and staff operations. The existing KTI visual identity, tuition, and published module-opening dates were preserved.

## Improvements

- Readable mobile form/payment text, larger touch targets, consistent card backgrounds, and responsive admin controls.
- Keyboard skip link on every page, Escape-to-close navigation with restored focus, and sign-in navigation that refreshes after route changes.
- Branded loading, error, and not-found states with safe recovery links.
- Fixed lesson quiz feedback disappearing after scoring by preserving the enhanced lesson DOM.
- Assessment Section A resumes from its saved result; failed requests preserve selections instead of locking the quiz.
- Written drafts persist in the same browser tab until submission, with an explicit storage notice and navigation warning.
- Assessment grading validates signed, student/course-bound question assignments. Retakes prioritize questions not used in the previous submitted attempt.
- Submitted written work cannot be overwritten through the local storage adapter.
- Topic completion and quiz actions validate the topic and enforce preceding-topic completion server-side.
- Staff can preview complete teaching and assessment material before student opening dates without recording preview scores or progress.
- Unfinished module guides no longer expose authoring placeholders or draft links. Published guides no longer repeat the page-level heading or claim to be a separate module assignment.
- Development preview is disabled when a hosted database is configured, as well as in production.
- Updated Next.js and its ESLint configuration to 16.3.5, sharp to 0.35.4, and the development-only js-yaml dependency.

The dependency update addresses the advisories reported by npm: [Next.js Windows-hosted server advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [Next.js AVIF advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), and [sharp/libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).

## Verification

| Boundary | Evidence |
| --- | --- |
| Public mobile pages | 320px sweep of home, curriculum, all five module pages, pricing, enrollment, login, scholarship, glossary, community, privacy, and 404. No horizontal overflow found. |
| Desktop and theme | 1440px public-page sweep; visual inspection of faculty and 390px dark-theme homepage. Mobile menu Escape/focus, skip-link focus, and theme persistence verified. |
| Faculty and media | All supplied faculty photos loaded at sufficient intrinsic resolution for their display sizes. Course-introduction videos loaded metadata and playable data without media errors. |
| Registration | Synthetic local registration created an account and pending enrollment; navigation changed to My studies without a hard refresh. |
| Scholarships | Synthetic applicant submitted need/goals; staff queue received them; local approval activated the associated enrollment. |
| Learning | All six ST 101 practice quizzes scored 100% server-side; completion persisted and unlocked the assessment. All 36 Module 1 lesson pages loaded with teaching and quizzes. |
| Assessment | Section A saved, refreshed page retained its result and a 210-character written draft, submission reached instructor review, and draft storage cleared on success. |
| Grading and retake | Local instructor awarded 50 written points; combined result was 56%. Next attempt showed 20 questions with zero repeats from the preceding attempt. |
| Community | Synthetic student contribution appeared in the module community. Storage regression checks cover staff moderation and separate engagement credit. |
| Admin | Account search returned the synthetic match. Export returned CSV with private/no-store caching; logged-out access returned 401 and student access returned 403. |
| Post-upgrade smoke | Authenticated topic scoring, staff previews, all 36 lesson responses, retake rendering, and export permissions rechecked on Next.js 16.3.5. |
| Automated checks | 159 regression checks passed; TypeScript, ESLint, and production build passed. Full npm audit and production-only npm audit reported zero known vulnerabilities after updates. |

## Safety and limits

- All write-based QA used synthetic accounts and a local JSON data store, with DATABASE_URL explicitly empty. No production registrations, scholarship decisions, grades, payments, or emails were created by this audit.
- A local-only process clock simulated October 2 to exercise the scheduled learning flow. No curriculum dates were edited. Module 1 remains scheduled to open October 1, 2026, in Chicago time.
- Existing local data was backed up before write-based QA and restored afterward.
- Real card transactions, Stripe settlement/webhook delivery, outbound email delivery, and real staff credential recovery were not exercised in production. Payment validation, promotions, refunds/disputes, and webhook-signature wiring are covered by regression checks.
- Later-module course content and guides still require completion by the Institute. This audit hides unfinished authoring material; it does not invent or certify missing academic content.
- Browser checks used Chromium at representative desktop/mobile widths, not physical-device testing on every browser. This is not a penetration test, formal accessibility certification, or exhaustive theological review.
- Continuous external monitoring and log-drain configuration were not changed. A deployment-time production error scan is a point-in-time check.
