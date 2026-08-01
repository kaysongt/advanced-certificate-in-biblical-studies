# Build Brief — from static syllabus to enrolling students

> Historical planning document. The Next.js platform, PostgreSQL adapter, staff operations,
> server-recorded assessment flow, and manual enrollment activation are now implemented.
> Use `DEPLOY.md` for the current production launch runbook. The remaining sections preserve
> the original product decisions and content scope.

This document scopes the work of turning the current static site into a live program
that students can find, pay for, and study inside. Read `README.md` first for how the
content pipeline works; this brief covers everything that sits on top of it.

---

## 1. Where the project stands today

**Content — 1 of 5 certificates written.**

| Module | Courses | Lessons | Written |
|---|---|---|---|
| I. Systematic Theology | ST 101–106 | 36 | ✅ complete |
| II. Biblical Foundations | BF 201–206 | 36 | scaffold only |
| III. Old Testament Survey | OT 301–305 | 30 | scaffold only |
| IV. New Testament Survey | NT 401–405 | 30 | scaffold only |
| V. Spiritual Formation | SF 501–510 | 40 | scaffold only |

11,032 `[FROM BOOK]` placeholders remain across Modules II–V.

**Platform — none.** The site is static HTML on GitHub Pages. There is no server, no
accounts, and no way to check whether someone has paid. Lesson progress lives in
`localStorage` (`kti.progress.v1`, `assets/course.js`), so it is tied to one browser and
is lost when a student switches device or clears data.

---

## 2. The two tracks, and why they are not the same size

**Track A — Content.** 136 lessons remain. A finished Module I lesson runs ~3,000 words,
which puts the outstanding work at roughly **408,000 words**, plus 26 course overviews and
26 assessments. That is the equivalent of about five books.

**Track B — Platform.** Enrollment, payment, accounts, gated lessons, grading, and
certificates. Meaningful, but on the order of 4–6 weeks of focused development.

Track A is the critical path by a wide margin, and it has a hard dependency: **Module I was
written from a real textbook** — its lessons quote "Chapter One" throughout. The program
is specified as 32 courses / 32 textbooks. The remaining 26 textbooks must be in the
writer's hands before those lessons can be written. Sourcing them is the first blocker to
clear, ahead of any code.

---

## 3. Recommended phasing — sell Certificate I first

Do not wait for all five certificates. Module I is complete and is already a saleable
product at the catalog price of **$250 per certificate**.

- **Phase 1 — Sell what exists.** Landing page + payment + accounts + gated access to
  Module I only. Revenue starts, and the platform gets tested by real students on a body
  of content that is genuinely finished.
- **Phase 2 — Write Modules II–V,** releasing each certificate as it completes. Students
  who bought the $1,000 bundle get each one unlocked as it ships.
- **Phase 3 — Advanced Certificate.** Final evaluation and the capstone credential once
  all five are live.

This also de-risks the pricing: you learn whether $250 converts before committing seven
months of writing.

---

## 4. Track B — platform specification

### 4.1 Architecture

Keep `build.py` and the markdown pipeline exactly as they are. They work, and the authoring
workflow depends on them. What changes is **where the output is served from and who is
allowed to see it**.

- Move hosting from GitHub Pages to a platform with edge middleware (Vercel, Netlify, or
  Cloudflare Pages). The build step stays `python3 build.py build`, publishing `docs/`.
- Middleware guards `/courses/**`. An unauthenticated or unenrolled request redirects to
  the sales page.
- Public and indexable: `/` (landing), `/modules/**` (syllabus), `/glossary`,
  `/scriptures`. These are the SEO surface and should stay open.

Do **not** hand-edit anything in `docs/` — `build.py` deletes that directory on every
build. All template changes belong in the `SHELL` string in `build.py`.

### 4.2 Accounts

Email + magic link (passwordless). Avoids storing passwords, avoids password-reset support
load, and works for a non-technical adult audience. Supabase Auth or Clerk both do this
out of the box. Confirm email deliverability into Nigerian inboxes during testing — this
is the most common silent failure in this kind of build.

### 4.3 Payments

**The processor follows the merchant entity, not the developer's location.**

- If **KingsWord US (Chicago)** is the entity receiving tuition → **Stripe Checkout**.
  Tuition is already denominated in USD.
- If a **Nigerian entity** is receiving it → **Paystack**. Stripe does not onboard
  Nigerian-registered businesses for payouts.
- **Strongly consider both.** $250 USD is a hard sell to a Nigerian student at
  parallel-market FX. A separate NGN price via Paystack — which also gives bank transfer
  and USSD, not just cards — is likely to matter more for local conversion than any
  landing-page copy. This is a pricing decision for Dr. Kay, not a technical one.

Flow: Checkout session → webhook (`checkout.session.completed` / `charge.success`) →
create enrollment row → unlock access. **Grant access on the webhook, never on the browser
redirect** — the redirect is trivially forged.

Also decide: payment plans. At $1,000 a bundle, instalments will likely lift conversion
more than a discount will.

### 4.4 Data model

Lesson IDs already exist in the generated markup as `data-lesson` attributes in the format
`{course-slug}-{n}` (e.g. `st-101-1`, from `build.py`). Reuse that format as the primary
key for progress — no new identifier scheme needed.

```
students      id, email, full_name, country, created_at
enrollments    id, student_id, product, status, amount, currency,
              provider, provider_ref, created_at
progress      student_id, lesson_id, completed_at          -- lesson_id = "st-101-1"
quiz_attempts student_id, quiz_id, score, attempted_at
assessments   student_id, course_code, section_scores, total,
              graded_by, graded_at, status
certificates  id, student_id, module_slug, serial, issued_at
```

`product` is one of `cert-01` … `cert-05` or `advanced`.

### 4.5 Progress migration

`assets/course.js` currently reads and writes `localStorage`. Change it to sync to
`/api/progress` when a session exists, and keep the `localStorage` path as the offline
fallback — self-paced students on unreliable connections will need it. On first login,
merge any existing local progress into the account rather than discarding it.

### 4.6 Grading — the piece that is easy to miss

Each course assessment is a 100-point paper: multiple choice, **five short-answer
questions, and an essay with a rubric**. Only the multiple choice can be auto-graded. The
short answers and essay need a human.

That means an **instructor dashboard** — a queue of submitted assessments, the rubric
alongside each, a score field, and a comment box. Without it there is no way to issue a
certificate, because the pass mark of 80% cannot be computed. Budget for this; it is a
real slice of Track B, not an afterthought.

### 4.7 Certificates

Five modular certificates plus the Advanced Certificate. Each needs PDF generation
(student name, program, serial number, date, signature) and a public verification URL
— `/verify/{serial}` — so an employer or church can confirm it. For a credential being
sold at $1,000, verification is what makes it credible.

### 4.8 Landing page

The current `index.html` is a program index for people already inside. A sales page is a
different job. Everything it needs is already in `curriculum.json`:

- Hero — title, tagline, the logo
- Outcomes — the eight `outcomes` entries
- Curriculum — five modules, 32 courses, 172 hours
- Instructor — Dr. Kay's bio; three decades, four continents, 100+ books is the strongest
  trust signal on the page and is currently buried
- Format — self-paced, modular certificates, customized textbooks
- Pricing — $250 / $1,000, plus instalments if offered
- FAQ, and an enroll CTA repeated down the page

Missing and worth gathering before launch: **student testimonials** and any accreditation
or affiliation claim. At this price point, social proof does more work than design.

---

## 5. Track A — content authoring

`README.md` covers the file format, the `:::` directives, and the build commands. Two
things it does not say:

**The quality bar is Module I.** Read `content/01-systematic-theology/st-101/lesson-01.md`
before writing anything. ~3,000 words, eight numbered teaching points, scripture blocks,
key terms, pull quotes sourced to book chapters, discussion questions, a reflection, a
five-question quiz with explanations, and a summary. Match it.

**Track progress with `python3 build.py status`** — it reports remaining placeholders per
course, which is the honest measure of how far along the writing is.

Suggested order: Module V (Spiritual Formation) next. Its courses are 4 lessons rather
than 6, so it completes fastest and gives you a second saleable certificate soonest.

---

## 6. Decisions needed from Dr. Kay before build starts

Carried over from `README.md`, plus new commercial ones:

1. **Which entity receives tuition** — US or Nigerian. Determines the processor. Blocking.
2. **NGN pricing** — separate local price, or USD only?
3. **Payment plans** — instalments on the $1,000 bundle?
4. **Grading weights** — currently 30/30/40 with an 80% pass mark; the component weights are flagged *PROPOSED* in
   `curriculum.json`. Must be confirmed before any certificate is issued.
5. **Who grades** the short answers and essays, and what turnaround do students get?
6. **Textbook supply** — when do the remaining 26 books reach the writer? This gates
   everything in Track A.
7. **Accreditation** — is any claimed? Affects landing-page copy and certificate wording.

---

## 7. Milestones

| # | Deliverable | Depends on |
|---|---|---|
| 1 | Landing page, public, no payment | — |
| 2 | Accounts + magic-link login | — |
| 3 | Checkout + webhook → enrollment | decision 1 |
| 4 | Gated `/courses/**`, Module I only | 2, 3 |
| 5 | Server-side progress + quiz scores | 2 |
| 6 | Instructor grading dashboard | 5, decision 5 |
| 7 | Certificate PDF + `/verify/{serial}` | 6, decision 4 |
| 8 | Modules II–V released as written | textbooks |

Milestones 1–4 are the minimum to take money for Certificate I and are the sensible
definition of Phase 1.
