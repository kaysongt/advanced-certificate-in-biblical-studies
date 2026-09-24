/**
 * Smoke checks for the content pipeline and storage layer.
 * Run with: npm run check
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StripePaymentStatus } from "@prisma/client";
import Stripe from "stripe";

import { hashPassword, verifyPassword, parseSession, serialiseSession } from "../lib/auth-core";
import { issuePasswordResetToken, verifyPasswordResetToken, resetTokenStudentId, RESET_LIFETIME_MS, resetRateKey, buildPasswordResetEmail } from "../lib/password-reset-core";
import { isStaff } from "../lib/auth";
import {
  postLoginPath,
  safeReturnPath,
  STAFF_ACCESS_REQUIRED_PATH,
  staffLoginPath,
} from "../lib/login-redirect";
import {
  entitlementRedirectPath,
  getModuleEnrollmentState,
  hasActiveAccess,
  hasMinisterWaiver,
  mustPayBeforeStudying,
} from "../lib/access";
import {
  getAssessmentBank,
  getCourseAudio,
  getCourseDoc,
  getCourseStatuses,
  getIndexes,
  getLesson,
  getLessonQuizQuestions,
  getLessonRows,
  getModuleDoc,
  getModuleStatuses,
  getPurchasableModules,
} from "../lib/content";
import {
  PRICING,
  findCourse,
  formatModuleReleaseDate,
  getCurriculum,
  isModuleReleased,
} from "../lib/curriculum";
import { ADMIN_NAV_ITEMS, isAdminRouteActive } from "../lib/admin-navigation";
import { csvCell, scholarshipCsv, registrationsCsv } from "../lib/admin-export";
import { classifyRegistrations, isInternalRegistration, registrationGroup, paymentEvidenceLabel, MINISTER_CODE, type RegistrationPayment } from "../lib/registration-groups";
import { adminSettingsRedirect } from "../lib/admin-settings";
import { issueAssessmentAttempt, verifyAssessmentAttempt } from "../lib/assessment-attempt";
import { prioritizeFreshQuestions } from "../lib/assessment-selection";
import { findDiscussionLesson } from "../lib/discussion-target";
import { isPrimaryRouteActive, PRIMARY_NAV_ITEMS } from "../lib/navigation";
import { getStripeCatalogItem } from "../lib/payments/catalog";
import {
  buildCheckoutSessionParams,
  checkoutSessionHasPromotion,
  checkoutSessionIdempotencyKey,
} from "../lib/payments/checkout-session";
import {
  blocksLatePaymentActivation,
  refundPaymentStatus,
  wonDisputePaymentStatus,
} from "../lib/payments/payment-policy";
import {
  chargeableAmountMinor,
  FULL_PROGRAM_DISCOUNT_MINOR,
  isAcceptedDiscount,
} from "../lib/payments/promotions";
import { sessionAmountIssues } from "../lib/payments/session-amounts";
import { STRIPE_API_VERSION } from "../lib/payments/stripe-version";
import { buildPaymentReminderEmail } from "../lib/reminders/payment-reminder-email";
import {
  calendarDaysUntil,
  currentProgramDate,
  getPaymentReminderTiming,
  selectPaymentReminderMilestone,
  shouldSuppressPaymentReminder,
} from "../lib/reminders/payment-reminder-policy";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

async function main() {
  console.log("\ncurriculum");
  const curriculum = getCurriculum();
  check("five modules load", () => assert.equal(curriculum.modules.length, 5));
  check("32 courses total", () =>
    assert.equal(
      curriculum.modules.reduce((n, m) => n + m.courses.length, 0),
      curriculum.program.total_courses
    )
  );
  check("all assessments use the confirmed 80% pass mark", () =>
    assert.equal(curriculum.grading.pass_mark, 80)
  );
  check("full-program pricing saves $250 over five individual certificates", () =>
    assert.equal(
      PRICING.certificate.amount * curriculum.program.total_certificates - PRICING.advanced.amount,
      250
    )
  );
  check("module release schedule matches the confirmed launch dates", () =>
    assert.deepEqual(
      curriculum.modules.map((item) => [
        item.short_title,
        item.release_date,
        formatModuleReleaseDate(item),
      ]),
      [
        ["Systematic Theology", "2026-10-01", "October 1, 2026"],
        ["Biblical Foundations", "2026-12-01", "December 1, 2026"],
        ["Old Testament Survey", "2027-02-01", "February 1, 2027"],
        ["New Testament Survey", "2027-04-01", "April 1, 2027"],
        ["Spiritual Formation", "2027-06-01", "June 1, 2027"],
      ]
    )
  );
  check("Module I opens at midnight Chicago time on October 1", () => {
    assert.equal(isModuleReleased(curriculum.modules[0], new Date("2026-10-01T04:59:59Z")), false);
    assert.equal(isModuleReleased(curriculum.modules[0], new Date("2026-10-01T05:00:00Z")), true);
  });
  check("all scheduled modules can be purchased before release", () =>
    assert.deepEqual(
      getPurchasableModules().map((item) => item.slug),
      curriculum.modules.map((item) => item.slug)
    )
  );

  console.log("\npayment reminders");
  for (const course of curriculum.modules[0].courses) {
    check(`${course.slug}: full fresh retake stays within its own question bank`, () => {
      const bank = getAssessmentBank(curriculum.modules[0], course);
      assert.ok(bank.length >= 40, `${bank.length} questions cannot support two disjoint 20-question attempts`);
      assert.equal(new Set(bank.map((q) => q.id)).size, bank.length);
      const first = prioritizeFreshQuestions(bank, [], 20);
      const retake = prioritizeFreshQuestions([...bank].reverse(), first.map((q) => q.id), 20);
      assert.equal(retake.length, 20);
      assert.ok(retake.every((q) => bank.includes(q) && !first.some((previous) => previous.id === q.id)));
      assert.ok(bank.every((q) => q.options.filter((o) => o.correct).length === 1));
    });
  }
  check("lesson discussions reject cross-module, unfinished, and nonexistent lessons", () => {
    assert.equal(findDiscussionLesson(curriculum.modules[0].slug, "st-101-1")?.row.n, 1);
    assert.equal(findDiscussionLesson(curriculum.modules[1].slug, "st-101-1"), null);
    assert.equal(findDiscussionLesson(curriculum.modules[1].slug, "bf-201-1"), null);
    assert.equal(findDiscussionLesson(curriculum.modules[0].slug, "st-101-99"), null);
  });
  check("program calendar dates follow Chicago rather than server UTC", () => {
    assert.equal(currentProgramDate(new Date("2026-10-01T04:59:59Z")), "2026-09-30");
    assert.equal(currentProgramDate(new Date("2026-10-01T05:00:00Z")), "2026-10-01");
  });
  check("calendar-day arithmetic is independent of daylight-saving hours", () => {
    assert.equal(calendarDaysUntil("2026-11-08", "2026-11-01"), 7);
  });
  check("reminder milestones select the most relevant due window", () => {
    assert.equal(selectPaymentReminderMilestone(22), null);
    assert.equal(selectPaymentReminderMilestone(21), "21-days");
    assert.equal(selectPaymentReminderMilestone(8), "21-days");
    assert.equal(selectPaymentReminderMilestone(7), "7-days");
    assert.equal(selectPaymentReminderMilestone(2), "7-days");
    assert.equal(selectPaymentReminderMilestone(1), "1-day");
    assert.equal(selectPaymentReminderMilestone(0), "started");
    assert.equal(selectPaymentReminderMilestone(-4), "started");
  });
  const advancedReminderTiming = getPaymentReminderTiming(
    { plan: "advanced", product: "advanced" },
    new Date("2026-09-10T15:00:00Z")
  );
  check("full-program reminders use the first module opening", () => {
    assert.equal(advancedReminderTiming?.startDate, "2026-10-01");
    assert.equal(advancedReminderTiming?.milestone, "21-days");
    assert.equal(advancedReminderTiming?.offeringTitle, curriculum.program.title);
  });
  const moduleReminderTiming = getPaymentReminderTiming(
    { plan: "certificate", product: curriculum.modules[1].slug },
    new Date("2026-11-24T16:00:00Z")
  );
  check("single-certificate reminders use that module's opening", () => {
    assert.equal(moduleReminderTiming?.startDate, "2026-12-01");
    assert.equal(moduleReminderTiming?.milestone, "7-days");
    assert.equal(moduleReminderTiming?.offeringTitle, "Biblical Foundations");
  });
  check("scholarships, settled codes, processing payments, and fresh checkout are suppressed", () => {
    const oldOpenAttempt = {
      status: "OPEN",
      needsReview: false,
      promotionCode: null,
      discountAmountMinor: 0,
      expectedAmountMinor: 100_000,
      updatedAt: new Date("2026-09-10T10:00:00Z"),
    };
    const now = new Date("2026-09-10T15:00:00Z");
    assert.equal(
      shouldSuppressPaymentReminder({
        scholarshipStatus: "PENDING",
        latestAttempt: null,
        now,
      }),
      true
    );
    assert.equal(
      shouldSuppressPaymentReminder({
        scholarshipStatus: "DECLINED",
        latestAttempt: null,
        now,
      }),
      false
    );
    assert.equal(
      shouldSuppressPaymentReminder({
        scholarshipStatus: null,
        latestAttempt: { ...oldOpenAttempt, status: "PROCESSING" },
        now,
      }),
      true
    );
    assert.equal(
      shouldSuppressPaymentReminder({
        scholarshipStatus: null,
        latestAttempt: { ...oldOpenAttempt, promotionCode: "ORDAINEDMINISTERS2026" },
        now,
      }),
      true
    );
    assert.equal(
      shouldSuppressPaymentReminder({
        scholarshipStatus: null,
        latestAttempt: {
          ...oldOpenAttempt,
          discountAmountMinor: oldOpenAttempt.expectedAmountMinor,
        },
        now,
      }),
      true
    );
    assert.equal(
      shouldSuppressPaymentReminder({
        scholarshipStatus: null,
        latestAttempt: { ...oldOpenAttempt, updatedAt: new Date("2026-09-10T14:30:00Z") },
        now,
      }),
      true
    );
    assert.equal(
      shouldSuppressPaymentReminder({
        scholarshipStatus: null,
        latestAttempt: oldOpenAttempt,
        now,
      }),
      false
    );
  });
  check("the reminder email states the access rule and escapes HTML", () => {
    assert.ok(advancedReminderTiming?.milestone);
    const email = buildPaymentReminderEmail({
      fullName: "<Kay> Student",
      amount: 1000,
      currency: "USD",
      timing: {
        ...advancedReminderTiming!,
        milestone: advancedReminderTiming!.milestone!,
      },
      dashboardUrl: "https://www.thekti.org/dashboard#complete-payment",
      scholarshipUrl: "https://www.thekti.org/scholarship?enrollment=example",
    });
    assert.match(email.subject, /starts in 21 days/i);
    assert.match(email.text, /did not unlock|lessons unlock/i);
    assert.match(email.text, /\$1,000/);
    assert.ok(email.html.includes("&lt;Kay&gt;"));
    assert.ok(!email.html.includes("Hello <Kay>"));
  });
  check("late registrants are told the exact remaining time, not the milestone band", () => {
    const timing = getPaymentReminderTiming(
      { plan: "advanced", product: "advanced" },
      new Date("2026-09-21T15:00:00Z")
    );
    assert.equal(timing?.milestone, "21-days");
    const email = buildPaymentReminderEmail({
      fullName: "Test Student",
      amount: 1000,
      currency: "USD",
      timing: { ...timing!, milestone: timing!.milestone! },
      dashboardUrl: "https://www.thekti.org/dashboard#complete-payment",
      scholarshipUrl: "https://www.thekti.org/scholarship?enrollment=example",
    });
    assert.match(email.subject, /starts in 10 days/i);
    assert.doesNotMatch(email.subject, /starts in 21 days/i);
  });

  const reminderRouteSource = await fs.readFile(
    path.join(process.cwd(), "app/api/cron/payment-reminders/route.ts"),
    "utf8"
  );
  const reminderSchemaSource = await fs.readFile(
    path.join(process.cwd(), "prisma/schema.prisma"),
    "utf8"
  );
  const vercelConfiguration = JSON.parse(
    await fs.readFile(path.join(process.cwd(), "vercel.json"), "utf8")
  ) as { crons?: { path: string; schedule: string }[] };
  check("the daily reminder job is registered with Vercel", () =>
    assert.deepEqual(vercelConfiguration.crons, [
      { path: "/api/cron/payment-reminders", schedule: "0 15 * * *" },
    ])
  );
  check("the reminder route requires Vercel's bearer secret", () => {
    assert.ok(reminderRouteSource.includes("CRON_SECRET"));
    assert.ok(reminderRouteSource.includes('request.headers.get("authorization")'));
    assert.ok(reminderRouteSource.includes("timingSafeEqual"));
  });
  check("reminder milestones are unique per enrollment in PostgreSQL", () =>
    assert.ok(reminderSchemaSource.includes("@@unique([enrollmentId, milestone])"))
  );

  console.log("\nnavigation");
  check("primary tabs point to distinct routes", () =>
    assert.deepEqual(
      PRIMARY_NAV_ITEMS.map((item) => [item.label, item.href]),
      [
        ["Curriculum", "/curriculum"],
        ["Pricing", "/pricing"],
        ["Scholarships", "/scholarship"],
        ["Community", "/community"],
        ["Glossary", "/glossary"],
      ]
    )
  );
  check("community tab stays active on community groups", () =>
    assert.equal(isPrimaryRouteActive("/community/01-systematic-theology", "/community"), true)
  );
  check("community never activates the curriculum tab", () =>
    assert.equal(isPrimaryRouteActive("/community", "/curriculum"), false)
  );
  check("scholarship route activates the public scholarship tab", () =>
    assert.equal(isPrimaryRouteActive("/scholarship", "/scholarship"), true)
  );

  console.log("\nhomepage faculty");
  const homePageSource = await fs.readFile(path.join(process.cwd(), "app/page.tsx"), "utf8");
  const homeStylesSource = await fs.readFile(
    path.join(process.cwd(), "app/globals.css"),
    "utf8"
  );
  const normalizedHomePageSource = homePageSource.replace(/\s+/g, " ");
  const facultyNames = [
    "Dr. Kay Ijisesan",
    "Pastor John Oyeniran",
    "Rev. Victor Adeyemi",
    "Rev. Tokunbo Adejuwon",
    "Pastor Bukky Manufor",
    "Pastor Achese Opuda",
    "Dr. Sam Ekundayo",
  ];
  check("homepage includes the seven-member faculty section", () => {
    assert.ok(homePageSource.includes('id="faculty"'));
    for (const name of facultyNames) assert.ok(homePageSource.includes(name), name);
    assert.ok(
      !homePageSource.includes(
        "Additional faculty portraits and biographies will be published as they are provided."
      )
    );
  });
  check("Pastor John has the supplied portrait and approved biography", () => {
    assert.ok(homePageSource.includes('src="/assets/faculty/dr-john-oyeniran.jpg"'));
    assert.ok(homePageSource.includes('alt="Pastor John Oyeniran"'));
    assert.ok(!homePageSource.includes("Dr. John Oyeniran"));
    assert.ok(normalizedHomePageSource.includes("Global School of Biblical Interpretation"));
  });
  check("Rev. Victor has the supplied portrait", () => {
    assert.ok(homePageSource.includes('src: "/assets/faculty/rev-victor-adeyemi.jpg"'));
    assert.ok(homePageSource.includes('alt: "Rev. Victor Adeyemi"'));
  });
  check("Pastor Bukky has the supplied portrait and corrected name", () => {
    assert.ok(homePageSource.includes('src: "/assets/faculty/pastor-bukky-manufor.jpg"'));
    assert.ok(homePageSource.includes('alt: "Pastor Bukky Manufor"'));
    assert.ok(!homePageSource.includes("Pst. Buki Manufor"));
  });
  check("Pastor Achese has the supplied portrait and corrected name", () => {
    assert.ok(homePageSource.includes('src: "/assets/faculty/pastor-achase-opuda.jpg"'));
    assert.ok(homePageSource.includes('alt: "Pastor Achese Opuda"'));
    assert.ok(!homePageSource.includes("Achase Opuda"));
  });
  check("Dr. Sam has the supplied portrait", () => {
    assert.ok(homePageSource.includes('src: "/assets/faculty/dr-sam-ekundayo.jpg"'));
    assert.ok(homePageSource.includes('alt: "Dr. Sam Ekundayo"'));
  });
  check("faculty styling includes feature and roster layouts", () => {
    assert.match(homeStylesSource, /\.faculty-feature-grid\s*\{/);
    assert.match(homeStylesSource, /\.faculty-roster-grid\s*\{/);
  });
  check("Dr. Kay's profile uses the latest supplied portrait", () => {
    assert.ok(
      homePageSource.includes('src="/assets/faculty/dr-kay-ijisesan-green.jpg"')
    );
  });
  const kayPortrait = await fs.stat(
    path.join(process.cwd(), "public/assets/faculty/dr-kay-ijisesan-green.jpg")
  );
  check("Dr. Kay's supplied portrait asset is present", () => {
    assert.ok(kayPortrait.size > 100_000);
  });
  const johnPortrait = await fs.stat(
    path.join(process.cwd(), "public/assets/faculty/dr-john-oyeniran.jpg")
  );
  check("Pastor John's portrait asset is present", () => {
    assert.ok(johnPortrait.size > 100_000);
  });
  const victorPortrait = await fs.stat(
    path.join(process.cwd(), "public/assets/faculty/rev-victor-adeyemi.jpg")
  );
  check("Rev. Victor's portrait asset is present", () => {
    assert.ok(victorPortrait.size > 50_000);
  });
  const bukkyPortrait = await fs.stat(
    path.join(process.cwd(), "public/assets/faculty/pastor-bukky-manufor.jpg")
  );
  check("Pastor Bukky's portrait asset is present", () => {
    assert.ok(bukkyPortrait.size > 50_000);
  });
  const achesePortrait = await fs.stat(
    path.join(process.cwd(), "public/assets/faculty/pastor-achase-opuda.jpg")
  );
  check("Pastor Achese's portrait asset is present", () => {
    assert.ok(achesePortrait.size > 50_000);
  });
  const samPortrait = await fs.stat(
    path.join(process.cwd(), "public/assets/faculty/dr-sam-ekundayo.jpg")
  );
  check("Dr. Sam's portrait asset is present", () => {
    assert.ok(samPortrait.size > 50_000);
  });

  console.log("\nprospective scholarship wiring");
  const scholarshipPageSource = await fs.readFile(
    path.join(process.cwd(), "app/scholarship/page.tsx"),
    "utf8"
  );
  const enrollPageSource = await fs.readFile(
    path.join(process.cwd(), "app/enroll/page.tsx"),
    "utf8"
  );
  const enrollFormSource = await fs.readFile(
    path.join(process.cwd(), "app/enroll/EnrollForm.tsx"),
    "utf8"
  );
  const enrollActionsSource = await fs.readFile(
    path.join(process.cwd(), "app/enroll/actions.ts"),
    "utf8"
  );
  check("public scholarship page wires the prospect enrollment handoff", () => {
    assert.ok(scholarshipPageSource.includes('href="/enroll?scholarship=apply"'));
    assert.ok(scholarshipPageSource.includes('href="/login?next=%2Fscholarship"'));
  });
  check("enrollment carries scholarship intent back to the private form", () => {
    assert.ok(enrollPageSource.includes('scholarship === "apply"'));
    assert.ok(enrollFormSource.includes('name="scholarshipIntent" value="apply"'));
    assert.ok(
      enrollActionsSource.includes(
        'redirect(scholarshipIntent === "apply" ? "/scholarship" : "/dashboard")'
      )
    );
  });

  console.log("\nadmin navigation");
  const dashboardSource = await fs.readFile(path.join(process.cwd(), "app/dashboard/page.tsx"), "utf8");
  const curriculumSource = await fs.readFile(path.join(process.cwd(), "app/curriculum/page.tsx"), "utf8");
  check("staff have a program preview entry point independent of enrollment and release", () => {
    assert.ok(dashboardSource.includes("const staffPreview = isStaff(student)"));
    assert.ok(dashboardSource.includes("{staffPreview ? ("));
    assert.ok(dashboardSource.includes("Preview courses →"));
    assert.ok(curriculumSource.includes("const staffPreview = actor ? isStaff(actor) : false"));
    assert.ok(curriculumSource.includes("Staff preview access"));
  });
  check("admin tabs point to operations and scholarship applications", () =>
    assert.deepEqual(
      ADMIN_NAV_ITEMS.map((item) => [item.label, item.href]),
      [
        ["Operations", "/admin"],
        ["Registration groups", "/admin/registrations"],
        ["Preview program", "/curriculum"],
        ["Scholarship applications", "/admin/scholarships"],
        ["Admin settings", "/admin/settings"],
      ]
    )
  );
  check("operations tab is only active on its own route, not a nested one", () => {
    assert.equal(isAdminRouteActive("/admin", "/admin"), true);
    assert.equal(isAdminRouteActive("/admin/scholarships", "/admin"), false);
  });
  check("scholarships tab stays active on nested scholarship routes", () => {
    assert.equal(isAdminRouteActive("/admin/scholarships", "/admin/scholarships"), true);
    assert.equal(isAdminRouteActive("/admin/scholarships/123", "/admin/scholarships"), true);
    assert.equal(isAdminRouteActive("/admin", "/admin/scholarships"), false);
  });

  console.log("\nadmin route wiring");
  check("assessment tokens bind the exact questions, course, and student", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `question-${i}`);
    const token = issueAssessmentAttempt("student-a", "st-101", ids);
    assert.equal(verifyAssessmentAttempt(token, "student-a", "st-101", ids), true);
    assert.equal(verifyAssessmentAttempt(token, "student-b", "st-101", ids), false);
    assert.equal(verifyAssessmentAttempt(token, "student-a", "st-102", ids), false);
    assert.equal(verifyAssessmentAttempt(token, "student-a", "st-101", ids.slice(0, 1)), false);
    assert.equal(verifyAssessmentAttempt(token, "student-a", "st-101", [...ids].reverse()), false);
    assert.equal(verifyAssessmentAttempt(`x${token}`, "student-a", "st-101", ids), false);
  });
  check("retakes exclude the previous questions when the bank has room", () => {
    const bank = Array.from({ length: 60 }, (_, i) => ({ id: `q-${i}` }));
    const previous = bank.slice(0, 20).map(q => q.id);
    const next = prioritizeFreshQuestions(bank, previous, 20);
    assert.equal(next.length, 20);
    assert.ok(next.every(q => !previous.includes(q.id)));
    assert.equal(prioritizeFreshQuestions(bank.slice(0, 10), previous, 20).length, 10);
  });
  check("CSV exports escape quotes, newlines, and formula injection", () => {
    assert.equal(csvCell('Name "quoted"'), '"Name ""quoted"""');
    assert.equal(csvCell("=SUM(A1)"), '"\'=SUM(A1)"');
    assert.equal(csvCell("\t+123"), '"\'\t+123"');
    assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
    assert.equal(csvCell(null), '""');
    assert.ok(scholarshipCsv([]).startsWith("\uFEFF"));
  });
  check("privileged redirects only accept known admin pages", () => {
    const data = new FormData();
    data.set("returnTo", "https://example.com");
    assert.equal(adminSettingsRedirect(data, "role", "done"), "/admin?role=done#students");
    data.set("returnTo", "/admin/settings");
    assert.equal(adminSettingsRedirect(data, "reset", "invalid"), "/admin/settings?reset=invalid");
  });
  check("registration export includes every account once, including accounts without enrollment", () => {
    const people = Array.from({ length: 31 }, (_, i) => ({
      id: `export-${i}`, fullName: `Person ${i}`, email: `export-${i}@example.test`,
      country: "Nigeria", role: "student" as const, createdAt: "2026-09-20T12:00:00.000Z",
      passwordHash: "SECRET-HASH-MUST-NOT-EXPORT",
    }));
    const csv = registrationsCsv(people, []);
    assert.equal(csv.split("\r\n").length, 32);
    assert.equal(csv.match(/No enrollment/g)?.length, 31);
    assert.ok(csv.includes('"export-30@example.test"'));
    assert.ok(!csv.includes("SECRET-HASH"));
    assert.ok(csv.startsWith("\uFEFF"));
    assert.equal(registrationsCsv([], []).split("\r\n").length, 1);
  });
  check("registration export groups multiple plans and distinguishes suspended access", () => {
    const person = { id: "export-person", fullName: '=HYPERLINK("bad")', email: "test@example.test", country: "Côte d’Ivoire", role: "admin" as const, createdAt: "2026-09-20T12:00:00.000Z" };
    const enrollment = { id: "export-enrollment", studentId: person.id, product: "advanced", plan: "advanced" as const, status: "active" as const, amount: 1000, currency: "USD", provider: "scholarship", providerRef: "SECRET-PROVIDER-REF", activatedAt: person.createdAt, accessSuspendedAt: null, createdAt: person.createdAt, updatedAt: person.createdAt };
    const csv = registrationsCsv([person], [enrollment, { ...enrollment, id: "other-plan", product: "module-2", provider: null, status: "pending", accessSuspendedAt: person.createdAt }], new Map([["advanced", "Full program"]]));
    assert.equal(csv.split("\r\n").length, 2);
    assert.ok(csv.includes(csvCell(person.fullName)));
    assert.ok(csv.includes('"2"'));
    assert.ok(csv.includes("Full program / active / scholarship"));
    assert.ok(csv.includes("module-2 / pending (access suspended) / Not recorded"));
    assert.ok(csv.includes("Côte d’Ivoire"));
    assert.ok(!csv.includes("SECRET-PROVIDER-REF"));
  });
  const registrationsExportSource = await fs.readFile(path.join(process.cwd(), "app/admin/registrations/export/route.ts"), "utf8");
  check("registration export checks staff access before reading the complete roster", () => {
    assert.ok(registrationsExportSource.indexOf("if (!isStaff(actor))") < registrationsExportSource.indexOf("await loadRegistrationReport()"));
    assert.match(registrationsExportSource, /status: 401/);
    assert.match(registrationsExportSource, /status: 403/);
    assert.match(registrationsExportSource, /private, no-store/);
    assert.match(registrationsExportSource, /attachment; filename=/);
    assert.ok(registrationsExportSource.includes('searchParams.get("group")'));
    assert.ok(!registrationsExportSource.includes('searchParams.get("q")'));
    assert.match(registrationsExportSource, /status: 400/);
  });
  const groupEnrollment = { id: "group-e", studentId: "group-s", product: "advanced", plan: "advanced" as const, status: "pending" as const, amount: 1000, currency: "USD", provider: null, providerRef: null, activatedAt: null, accessSuspendedAt: null, createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z" };
  const groupAttempt: RegistrationPayment = { enrollmentId: groupEnrollment.id, status: "open", promotionCode: null, discountAmountMinor: 0, paidAmountMinor: 0, refundedAmountMinor: 0, currency: "usd", needsReview: false, updatedAt: "2026-09-01T12:00:00.000Z" };
  const classifyOne = (scholarships: Parameters<typeof classifyRegistrations>[2] = [], attempts: RegistrationPayment[] = []) => classifyRegistrations([{ id: "group-s" }], [groupEnrollment], scholarships, attempts).get("group-s")!;
  check("internal test addresses are excluded without excluding real staff or students", () => {
    for (const email of ["stripe-smoke@example.com","test@example.net","test@example.org","test@kti.test","test@kti.invalid"]) assert.equal(isInternalRegistration({email}),true);
    for (const email of ["person@gmail.com","staff@kingsword.org","testperson@yahoo.com"]) assert.equal(isInternalRegistration({email}),false);
  });
  check("registration groups separate no-attempt accounts from all unconfirmed payment activity", () => {
    assert.equal(classifyOne().group, "not-started");
    for (const status of ["created", "open", "failed", "expired", "processing", "paid", "refunded", "disputed"]) {
      assert.equal(classifyOne([], [{ ...groupAttempt, status }]).group, "payment-pending");
    }
    assert.equal(registrationGroup("ministers"), "ministers");
    assert.equal(registrationGroup("made-up-group"), null);
  });
  check("scholarships supersede payments but not verified minister waivers", () => {
    for (const status of ["pending", "approved", "declined"] as const) {
      const result = classifyOne([{ studentId: "group-s", status }], [{ ...groupAttempt, status: "paid", paidAmountMinor: 10000, promotionCode: MINISTER_CODE }]);
      assert.equal(result.group, "scholarship");
      assert.equal(result.scholarshipStatuses, status);
      assert.equal(result.ministerCodeRecorded, true);
      assert.equal(result.paymentActivity, true);
      const waived = classifyRegistrations([{id:"group-s"}], [{...groupEnrollment,provider:"minister-waiver",status:"active"}], [{studentId:"group-s",status}], [groupAttempt]).get("group-s")!;
      assert.equal(waived.group, "ministers");
      assert.equal(waived.scholarshipStatuses, status);
    }
  });
  check("historic minister-code use survives later checkout retries and zero-cost is not paid", () => {
    const codeAttempt = { ...groupAttempt, promotionCode: ` ${MINISTER_CODE.toLowerCase()} `, discountAmountMinor: 100000, status: "paid" };
    const result = classifyRegistrations([{id:"group-s"}], [{...groupEnrollment,status:"active"}], [], [codeAttempt, { ...groupAttempt, updatedAt: "2026-09-02T12:00:00.000Z", status: "failed" }]).get("group-s")!;
    assert.equal(result.group, "ministers");
    assert.equal(result.checkoutCount, 2);
    assert.match(result.ministerCodeStatus, /Completed without payment/);
    assert.equal(classifyOne([], [codeAttempt]).group, "payment-pending");
    assert.equal(classifyOne([], [{ ...codeAttempt, promotionCode: "ANOTHER-CODE" }]).ministerCodeRecorded, false);
  });
  check("grouping does not infer payment from active access and retains manual verification caveat", () => {
    const active = { ...groupEnrollment, status: "active" as const };
    assert.equal(classifyRegistrations([{ id: "group-s" }], [active], [], []).get("group-s")!.group, "not-started");
    const manual = classifyRegistrations([{ id: "group-s" }], [{ ...active, provider: "manual" }], [], []).get("group-s")!;
    assert.equal(manual.group, "payment-pending");
    assert.match(manual.communicationNote, /HOLD/);
    assert.match(manual.paymentDetails, /verify receipt/);
    assert.match(paymentEvidenceLabel({ ...groupAttempt, status: "refunded", paidAmountMinor: 100000, refundedAmountMinor: 100000, needsReview: true }), /Refunded; received USD 1000.00; refunded USD 1000.00; staff review required/);
  });
  check("grouping joins each person's multiple enrollments without leaking others' activity", () => {
    const result = classifyRegistrations([{ id: "group-s" }, { id: "other-s" }, { id: "no-enrollment" }], [groupEnrollment, { ...groupEnrollment, id: "second-e" }, { ...groupEnrollment, id: "other-e", studentId: "other-s" }], [], [{ ...groupAttempt, enrollmentId: "second-e", promotionCode: MINISTER_CODE }, { ...groupAttempt, enrollmentId: "other-e" }, { ...groupAttempt, enrollmentId: "orphan-e", promotionCode: MINISTER_CODE }]);
    assert.equal(result.size, 3);
    assert.equal(result.get("group-s")!.group, "payment-pending");
    assert.equal(result.get("other-s")!.group, "payment-pending");
    assert.equal(result.get("other-s")!.ministerCodeRecorded, false);
    assert.equal(result.get("no-enrollment")!.group, "not-started");
  });
  check("registration CSV includes grouping evidence and escapes payment history formulas", () => {
    const student = { id: "group-s", fullName: "Test Person", email: "test@example.test", country: "Nigeria", role: "student" as const, createdAt: groupEnrollment.createdAt };
    const details = classifyOne();
    const csv = registrationsCsv([student], [groupEnrollment], new Map(), new Map([[student.id, { ...details, paymentDetails: "=HYPERLINK(\"bad\")" }]]));
    assert.ok(csv.includes('"Registration group"'));
    assert.ok(csv.includes('"Not started payment"'));
    assert.ok(csv.includes('"Communication guidance"'));
    assert.ok(csv.includes(csvCell('=HYPERLINK("bad")')));
    assert.ok(!csv.includes("Not classified"));
  });
  check("confirmed payment excludes refunds, disputes, review flags and zero-cost completions", () => {
    const paid = {...groupAttempt,status:"paid",paidAmountMinor:100000};
    assert.equal(classifyOne([], [paid]).group, "paid");
    for (const change of [{needsReview:true},{refundedAmountMinor:1},{paidAmountMinor:0},{status:"disputed"},{status:"partially-refunded"}]) {
      assert.equal(classifyOne([], [{...paid,...change}]).group, "payment-pending");
    }
    assert.equal(classifyOne([], [paid,{...groupAttempt,needsReview:true}]).group,"payment-pending");
  });
  check("minister-first grouping produces a complete disjoint partition without changing input", () => {
    const students = Array.from({length:5},(_,i)=>({id:`partition-${i}`}));
    const enrollments = students.map((s,i)=>({...groupEnrollment,id:`e-${i}`,studentId:s.id,...(i===0?{status:"active" as const,provider:"minister-waiver"}:{} )}));
    const scholarships = students.slice(0,2).map(s=>({studentId:s.id,status:"pending" as const}));
    const attempts = students.slice(0,4).map((_,i)=>({...groupAttempt,enrollmentId:`e-${i}`,...(i===2?{status:"paid",paidAmountMinor:100000}:{})}));
    const before = JSON.stringify({students,enrollments,scholarships,attempts});
    const result = classifyRegistrations(students,enrollments,scholarships,attempts);
    assert.deepEqual([...result.values()].map(r=>r.group),["ministers","scholarship","paid","payment-pending","not-started"]);
    assert.equal(result.size,students.length);
    assert.equal(JSON.stringify({students,enrollments,scholarships,attempts}),before);
  });
  const adminPageSource = await fs.readFile(
    path.join(process.cwd(), "app/admin/page.tsx"),
    "utf8"
  );
  const adminScholarshipsPageSource = await fs.readFile(
    path.join(process.cwd(), "app/admin/scholarships/page.tsx"),
    "utf8"
  );
  check("/admin source omits the direct private scholarship-list call", () =>
    assert.ok(!adminPageSource.includes("listScholarshipApplications"))
  );
  check("/admin/scholarships source includes the scholarship-list call", () =>
    assert.ok(adminScholarshipsPageSource.includes("listScholarshipApplications"))
  );
  check("logged-out staff routes preserve their destination through sign-in", () => {
    assert.equal(staffLoginPath("/admin"), "/login?next=%2Fadmin");
    assert.equal(
      staffLoginPath("/admin/scholarships"),
      "/login?next=%2Fadmin%2Fscholarships"
    );
    assert.ok(adminPageSource.includes('staffLoginPath("/admin")'));
    assert.ok(adminScholarshipsPageSource.includes('staffLoginPath("/admin/scholarships")'));
  });
  check("only staff roles can return to Staff Operations after sign-in", () => {
    assert.equal(postLoginPath("staff", "/admin/scholarships"), "/admin/scholarships");
    assert.equal(postLoginPath("admin", "/admin"), "/admin");
    assert.equal(postLoginPath("student", "/admin"), STAFF_ACCESS_REQUIRED_PATH);
  });
  check("post-login redirects reject external destinations", () => {
    assert.equal(safeReturnPath("https://example.com"), "/dashboard");
    assert.equal(safeReturnPath("//example.com"), "/dashboard");
    assert.equal(safeReturnPath("/\\example.com"), "/dashboard");
  });
  check("staff operations shows the latest payment reminder state", () => {
    assert.ok(adminPageSource.includes("listLatestPaymentReminders"));
    assert.ok(adminPageSource.includes("Reminder delivery failed"));
  });
  const globalCssSource = await fs.readFile(
    path.join(process.cwd(), "app/globals.css"),
    "utf8"
  );
  check("the stylesheet includes the admin tab selectors", () => {
    assert.match(globalCssSource, /\.admin-tabs\s*\{/);
    assert.match(globalCssSource, /\.admin-tab\s*\{/);
    assert.match(globalCssSource, /\.admin-tab-count\s*\{/);
    assert.match(globalCssSource, /\.admin-reminder-state\s*\{/);
  });
  const adminActionsSource = await fs.readFile(
    path.join(process.cwd(), "app/admin/actions.ts"),
    "utf8"
  );
  check("the review action wires revalidation for the dedicated route", () =>
    assert.ok(adminActionsSource.includes('revalidatePath("/admin/scholarships")'))
  );

  console.log("\ncontent rendering");
  const found = findCourse("st-101");
  assert.ok(found, "st-101 should exist");
  const { module, course } = found;

  const rows = getLessonRows(module, course);
  check("st-101 has six lessons", () => assert.equal(rows.length, 6));
  check("lesson ids match the legacy format", () => assert.equal(rows[0].id, "st-101-1"));
  check("module I lesson titles are written", () =>
    assert.ok(!rows[0].title.startsWith("Lesson "), `got "${rows[0].title}"`)
  );

  const lesson = getLesson(module, course, 1);
  check("lesson renders html", () => assert.ok(lesson.html.length > 2000));
  check("objectives directive renders", () =>
    assert.match(lesson.html, /<div class="objectives">/)
  );
  check("scripture directive renders", () =>
    assert.match(lesson.html, /<div class="scripture">/)
  );
  check("terms directive renders", () => assert.match(lesson.html, /<dl class="terms">/));
  check("quiz directive renders", () => assert.match(lesson.html, /<section class="quiz"/));
  check("quiz marks a correct answer", () =>
    assert.match(lesson.html, /data-correct="1"/)
  );
  check("rendered and server-graded quiz options use the same order", () => {
    const serverQuestions = getLessonQuizQuestions(module, course, 1);
    const renderedOptions = [...lesson.html.matchAll(/class="opt" data-correct="([01])"/g)].map(
      (match) => match[1] === "1"
    );
    assert.deepEqual(
      renderedOptions,
      serverQuestions.flatMap((question) => question.options.map((option) => option.correct))
    );
  });
  check("no raw directive markers leak through", () =>
    assert.ok(!lesson.html.includes(":::"), "found an unrendered ::: marker")
  );
  check("no block placeholders leak through", () =>
    assert.ok(!lesson.html.includes("KTIBLOCK"), "found an unreplaced KTIBLOCK")
  );
  const moduleDoc = getModuleDoc(module);
  check("student module page omits duplicate gain and instructor sections", () => {
    assert.ok(!moduleDoc.html.includes("What Students Gain"));
    assert.ok(!moduleDoc.html.includes("Instructor Notes"));
  });
  const courseDoc = getCourseDoc(module, course);
  check("student course page omits instructor notes", () =>
    assert.ok(!courseDoc.html.includes("Instructor Notes"))
  );

  console.log("\nindexes");
  const { terms, scriptures } = getIndexes();
  check("glossary collects terms", () => assert.ok(terms.length > 100, `${terms.length}`));
  // Module I is the only written module: 36 lessons, roughly one keyed
  // :::scripture block each.
  check("scripture index collects refs", () =>
    assert.ok(scriptures.length >= 30, `only ${scriptures.length} refs`)
  );

  console.log("\ncourse status");
  const statuses = getCourseStatuses();
  const st101 = statuses.find((s) => s.course.slug === "st-101")!;
  check("st-101 reports complete", () => assert.equal(st101.complete, true));
  check("a module II course reports incomplete", () =>
    assert.equal(statuses.find((s) => s.course.slug === "bf-201")!.complete, false)
  );
  check("completed Module I content stays locked before its release date", () => {
    const prelaunch = getCourseStatuses(new Date("2026-08-31T12:00:00Z"));
    assert.equal(prelaunch.find((s) => s.course.slug === "st-101")!.available, false);
  });
  check("completed Module I content opens on its release date", () => {
    const launch = getModuleStatuses(new Date("2026-10-01T12:00:00Z"));
    assert.equal(launch.find((s) => s.module.slug === module.slug)!.available, true);
  });
  const assessmentBank = getAssessmentBank(module, course);
  check("st-101 has a deep randomized assessment bank", () =>
    assert.ok(assessmentBank.length >= 100, `${assessmentBank.length} questions`)
  );
  check("assessment questions have one correct option", () =>
    assert.ok(assessmentBank.every((question) => question.options.filter((option) => option.correct).length === 1))
  );
  const audio = getCourseAudio(course.slug);
  check("st-101 audiobook is mapped chapter by chapter", () =>
    assert.ok(audio && audio.tracks.length >= 10, `${audio?.tracks.length ?? 0} recordings`)
  );
  check("every Module I course can draw a different 20-question retake", () =>
    assert.ok(
      module.courses.every((item) => getAssessmentBank(module, item).length > 40),
      "a Module I assessment bank is too small"
    )
  );
  check("every Module I course has its supplied audiobook", () =>
    assert.ok(
      module.courses.every((item) => (getCourseAudio(item.slug)?.tracks.length ?? 0) >= 10),
      "a Module I audiobook is missing"
    )
  );

  console.log("\naccess control");
  const enrollmentBase = {
    id: "enrollment",
    studentId: "student",
    product: "advanced",
    plan: "advanced" as const,
    amount: 1000,
    currency: "USD",
    provider: null,
    providerRef: null,
    activatedAt: null,
    accessSuspendedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  check("minister waiver requires active full-program unsuspended grant", () => {
    const waiver = { ...enrollmentBase, provider: "minister-waiver", amount: 0, status: "active" as const };
    assert.equal(hasMinisterWaiver([waiver]), true);
    assert.equal(hasMinisterWaiver([{ ...waiver, status: "pending" }]), false);
    assert.equal(hasMinisterWaiver([{ ...waiver, accessSuspendedAt: new Date().toISOString() }]), false);
    assert.equal(hasMinisterWaiver([{ ...waiver, product: module.slug }]), false);
    assert.equal(hasMinisterWaiver([{ ...waiver, provider: "stripe" }]), false);
    assert.equal(mustPayBeforeStudying([waiver, { ...enrollmentBase, status: "pending" }]), false);
  });
  check("pending enrollment does not grant access", () =>
    assert.equal(hasActiveAccess([{ ...enrollmentBase, status: "pending" }], module.slug), false)
  );
  check("pending full-program enrollment includes every certificate", () => {
    const pendingAdvanced = [{ ...enrollmentBase, status: "pending" as const }];
    assert.equal(getModuleEnrollmentState(pendingAdvanced, module.slug), "pending");
    assert.equal(
      getModuleEnrollmentState(pendingAdvanced, curriculum.modules[1].slug),
      "pending"
    );
  });
  check("pending single-certificate enrollment only includes its selected certificate", () => {
    const pendingCertificate = [
      {
        ...enrollmentBase,
        product: module.slug,
        plan: "certificate" as const,
        status: "pending" as const,
      },
    ];
    assert.equal(getModuleEnrollmentState(pendingCertificate, module.slug), "pending");
    assert.equal(
      getModuleEnrollmentState(pendingCertificate, curriculum.modules[1].slug),
      "none"
    );
  });
  check("active advanced enrollment grants access", () =>
    assert.equal(hasActiveAccess([{ ...enrollmentBase, status: "active" }], module.slug), true)
  );
  check("a payment dispute suspends otherwise active access", () =>
    assert.equal(
      hasActiveAccess(
        [{ ...enrollmentBase, status: "active", accessSuspendedAt: new Date().toISOString() }],
        module.slug
      ),
      false
    )
  );
  check("a suspended payment remains enrolled without granting access", () =>
    assert.equal(
      getModuleEnrollmentState(
        [{ ...enrollmentBase, status: "active", accessSuspendedAt: new Date().toISOString() }],
        module.slug
      ),
      "suspended"
    )
  );
  check("active single-certificate enrollment is scoped", () =>
    assert.equal(
      hasActiveAccess(
        [{ ...enrollmentBase, product: module.slug, plan: "certificate", status: "active" }],
        module.slug
      ),
      true
    )
  );
  check("an unpaid student is sent to payment at sign-in", () =>
    assert.equal(mustPayBeforeStudying([{ ...enrollmentBase, status: "pending" }]), true)
  );
  check("a student who already paid for something is not sent to payment", () =>
    assert.equal(
      mustPayBeforeStudying([
        { ...enrollmentBase, status: "active" },
        { ...enrollmentBase, id: "second", product: module.slug, plan: "certificate", status: "pending" },
      ]),
      false
    )
  );
  check("a suspended enrollment still counts as owing payment", () =>
    assert.equal(
      mustPayBeforeStudying([
        { ...enrollmentBase, status: "active", accessSuspendedAt: new Date().toISOString() },
        { ...enrollmentBase, id: "second", status: "pending" },
      ]),
      true
    )
  );
  check("unpaid students reach the payment prompt, not the sign-up form", () =>
    assert.equal(
      entitlementRedirectPath([{ ...enrollmentBase, status: "pending" }]),
      "/dashboard?payment=required"
    )
  );
  check("students with nothing pending are still offered enrollment", () =>
    assert.equal(entitlementRedirectPath([{ ...enrollmentBase, status: "refunded" }]), "/enroll")
  );

  console.log("\npayments");
  const advancedPayment = getStripeCatalogItem({
    plan: "advanced",
    product: "advanced",
    amount: 1000,
    currency: "USD",
  });
  check("advanced tuition converts to Stripe minor units on the server", () =>
    assert.equal(advancedPayment.amountMinor, 100_000)
  );
  const certificatePayment = getStripeCatalogItem({
    plan: "certificate",
    product: module.slug,
    amount: 250,
    currency: "USD",
  });
  check("certificate tuition converts to Stripe minor units on the server", () =>
    assert.equal(certificatePayment.amountMinor, 25_000)
  );
  const futureCertificatePayment = getStripeCatalogItem({
    plan: "certificate",
    product: curriculum.modules[4].slug,
    amount: 250,
    currency: "USD",
  });
  check("an unreleased certificate can be paid for in advance", () =>
    assert.equal(futureCertificatePayment.amountMinor, 25_000)
  );
  check("stored price tampering is rejected", () =>
    assert.throws(() =>
      getStripeCatalogItem({
        plan: "advanced",
        product: "advanced",
        amount: 1,
        currency: "USD",
      })
    )
  );
  const checkoutParams = buildCheckoutSessionParams({
    enrollmentId: "enrollment-check",
    paymentAttemptId: "attempt-check",
    catalogKey: "advanced",
    customerEmail: "checkout-check@example.com",
    priceId: "price_check",
    appBaseUrl: "https://www.thekti.org",
  });
  check("Checkout remains compatible with Stripe Managed Payments", () => {
    assert.equal("custom_text" in checkoutParams, false);
    assert.equal("wallet_options" in checkoutParams, false);
    assert.equal("managed_payments" in checkoutParams, false);
    assert.equal(checkoutParams.customer_email, "checkout-check@example.com");
    assert.equal(checkoutParams.success_url, "https://www.thekti.org/dashboard?payment=success");
  });
  check("Checkout retries do not change expiry or reuse a legacy rejected key", () => {
    assert.equal("expires_at" in checkoutParams, false);
    const key = checkoutSessionIdempotencyKey("attempt-check", checkoutParams);
    assert.notEqual(key, "kti-checkout:attempt-check");
    assert.equal(key, checkoutSessionIdempotencyKey("attempt-check", JSON.parse(JSON.stringify(checkoutParams))));
    assert.notEqual(key, checkoutSessionIdempotencyKey("another-attempt", checkoutParams));
  });
  const certificateCheckoutParams = buildCheckoutSessionParams({
    enrollmentId: "enrollment-check",
    paymentAttemptId: "attempt-check",
    catalogKey: "certificate",
    customerEmail: "checkout-check@example.com",
    priceId: "price_check",
    appBaseUrl: "https://www.thekti.org",
  });
  check("the full program accepts a promotion code and a single certificate does not", () => {
    assert.equal(checkoutParams.allow_promotion_codes, true);
    assert.equal("allow_promotion_codes" in certificateCheckoutParams, false);
  });
  const noCostCheckoutParams = buildCheckoutSessionParams({
    enrollmentId: "enrollment-check",
    paymentAttemptId: "attempt-check",
    catalogKey: "advanced",
    customerEmail: "checkout-check@example.com",
    priceId: "price_check",
    appBaseUrl: "https://www.thekti.org",
    promotionCodeId: "promo_full_tuition",
  });
  check("an entered full-tuition code is applied before Checkout opens", () => {
    assert.notEqual(
      checkoutSessionIdempotencyKey("attempt-check", checkoutParams),
      checkoutSessionIdempotencyKey("attempt-check", noCostCheckoutParams)
    );
    assert.deepEqual(noCostCheckoutParams.discounts, [
      { promotion_code: "promo_full_tuition" },
    ]);
    assert.equal("allow_promotion_codes" in noCostCheckoutParams, false);
  });
  check("a promotion cannot be attached to a single certificate", () =>
    assert.throws(() =>
      buildCheckoutSessionParams({
        enrollmentId: "enrollment-check",
        paymentAttemptId: "attempt-check",
        catalogKey: "certificate",
        customerEmail: "checkout-check@example.com",
        priceId: "price_check",
        appBaseUrl: "https://www.thekti.org",
        promotionCodeId: "promo_full_tuition",
      })
    )
  );
  check("an existing Session is reused only when it has the requested promotion", () => {
    assert.equal(
      checkoutSessionHasPromotion(
        { discounts: [{ coupon: null, promotion_code: "promo_full_tuition" }] },
        "promo_full_tuition"
      ),
      true
    );
    assert.equal(
      checkoutSessionHasPromotion(
        { discounts: [{ coupon: null, promotion_code: "promo_different" }] },
        "promo_full_tuition"
      ),
      false
    );
  });
  check("the promotion takes 100% off the full program", () => {
    // The ceiling must track the catalog price, or the webhook refuses the
    // very redemption the Stripe coupon is built to allow.
    assert.equal(FULL_PROGRAM_DISCOUNT_MINOR, advancedPayment.amountMinor);
    assert.equal(advancedPayment.amountMinor - FULL_PROGRAM_DISCOUNT_MINOR, 0);
  });
  check("a discount beyond the approved promotion is refused", () => {
    assert.equal(isAcceptedDiscount("advanced", 0), true);
    assert.equal(isAcceptedDiscount("advanced", FULL_PROGRAM_DISCOUNT_MINOR), true);
    assert.equal(isAcceptedDiscount("advanced", FULL_PROGRAM_DISCOUNT_MINOR + 1), false);
    assert.equal(isAcceptedDiscount("advanced", -1), false);
  });
  check("a single certificate cannot be discounted at all", () => {
    assert.equal(isAcceptedDiscount("certificate", 0), true);
    assert.equal(isAcceptedDiscount("certificate", 1), false);
  });
  check("a fully discounted enrollment owes nothing", () =>
    assert.equal(
      chargeableAmountMinor({
        expectedAmountMinor: advancedPayment.amountMinor,
        discountAmountMinor: FULL_PROGRAM_DISCOUNT_MINOR,
      }),
      0
    )
  );
  // A paid full-program Session at list price, as Stripe reports it back.
  const paidSessionFacts = {
    plan: "advanced" as const,
    expectedAmountMinor: 100_000,
    recordedDiscountMinor: 0,
    attemptCurrency: "usd",
    sessionCurrency: "usd",
    amountSubtotal: 100_000,
    amountTotal: 100_000,
    discountMinor: 0,
    taxMinor: 0,
    shippingMinor: 0,
    lineItemCount: 1,
    lineQuantity: 1,
    lineAmountSubtotal: 100_000,
    lineAmountDiscount: 0,
    lineAmountTax: 0,
    lineAmountTotal: 100_000,
    paymentStatusPaid: true,
    amountReceived: 100_000,
  };
  check("an undiscounted full-program payment validates cleanly", () =>
    assert.deepEqual(sessionAmountIssues(paidSessionFacts), [])
  );
  // Stripe charges nothing for a $0 total, so there is no PaymentIntent to
  // report an amount received and payment_status never reaches "paid".
  check("a Session zeroed by the promotion validates cleanly", () =>
    assert.deepEqual(
      sessionAmountIssues({
        ...paidSessionFacts,
        amountTotal: 0,
        discountMinor: 100_000,
        lineAmountDiscount: 100_000,
        lineAmountTotal: 0,
        paymentStatusPaid: false,
        amountReceived: null,
      }),
      []
    )
  );
  check("Stripe Tax raising the total does not block activation", () =>
    assert.deepEqual(
      sessionAmountIssues({
        ...paidSessionFacts,
        amountTotal: 108_250,
        taxMinor: 8_250,
        lineAmountTax: 8_250,
        lineAmountTotal: 108_250,
        amountReceived: 108_250,
      }),
      []
    )
  );
  // Tax survives the discount, so a zeroed enrollment can still owe tax alone.
  check("tax and the promotion combine without blocking activation", () =>
    assert.deepEqual(
      sessionAmountIssues({
        ...paidSessionFacts,
        amountTotal: 8_250,
        discountMinor: 100_000,
        taxMinor: 8_250,
        lineAmountDiscount: 100_000,
        lineAmountTax: 8_250,
        lineAmountTotal: 8_250,
        amountReceived: 8_250,
      }),
      []
    )
  );
  check("a discount larger than the promotion is refused", () =>
    assert.deepEqual(
      sessionAmountIssues({
        ...paidSessionFacts,
        amountTotal: -1,
        discountMinor: 100_001,
        lineAmountDiscount: 100_001,
        lineAmountTotal: -1,
        amountReceived: -1,
      }),
      ["discount outside the approved promotion", "negative charge"]
    )
  );
  check("a tampered catalog price trips every amount guard, not just one", () =>
    assert.deepEqual(
      sessionAmountIssues({
        ...paidSessionFacts,
        amountSubtotal: 10_000,
        amountTotal: 10_000,
        lineAmountSubtotal: 10_000,
        lineAmountTotal: 10_000,
        amountReceived: 10_000,
      }),
      [
        "subtotal mismatch",
        "amount mismatch",
        "line subtotal mismatch",
        "line amount mismatch",
        "received amount mismatch",
      ]
    )
  );
  check("paying less than the total owed is refused", () =>
    assert.deepEqual(
      sessionAmountIssues({ ...paidSessionFacts, amountReceived: 1_000 }),
      ["received amount mismatch"]
    )
  );
  check("a single certificate accepts no discount at checkout", () =>
    assert.ok(
      sessionAmountIssues({
        ...paidSessionFacts,
        plan: "certificate",
        expectedAmountMinor: 25_000,
        amountSubtotal: 25_000,
        amountTotal: 20_000,
        discountMinor: 5_000,
        lineAmountSubtotal: 25_000,
        lineAmountDiscount: 5_000,
        lineAmountTotal: 20_000,
        amountReceived: 20_000,
      }).includes("discount outside the approved promotion")
    )
  );
  check("a currency other than the enrollment's is refused", () =>
    assert.deepEqual(
      sessionAmountIssues({ ...paidSessionFacts, sessionCurrency: "ngn" }),
      ["currency mismatch"]
    )
  );
  check("a zeroed enrollment leaves no balance a refund could partly cover", () => {
    const chargeable = chargeableAmountMinor({
      expectedAmountMinor: advancedPayment.amountMinor,
      discountAmountMinor: FULL_PROGRAM_DISCOUNT_MINOR,
    });
    assert.equal(chargeable, 0);
    // Tuition raises no charge at all, so the only refund that can arrive is
    // for tax collected on top of it, and that reads as full, never partial.
    assert.equal(refundPaymentStatus(0, chargeable), StripePaymentStatus.REFUNDED);
    assert.equal(refundPaymentStatus(8_250, chargeable), StripePaymentStatus.REFUNDED);
  });
  check("refunds and disputes block stale success events", () => {
    assert.equal(blocksLatePaymentActivation(StripePaymentStatus.REFUNDED), true);
    assert.equal(blocksLatePaymentActivation(StripePaymentStatus.DISPUTED), true);
    assert.equal(blocksLatePaymentActivation(StripePaymentStatus.FAILED), false);
  });
  check("partial and full refunds produce different durable states", () => {
    assert.equal(
      refundPaymentStatus(10_000, 25_000),
      StripePaymentStatus.PARTIALLY_REFUNDED
    );
    assert.equal(refundPaymentStatus(25_000, 25_000), StripePaymentStatus.REFUNDED);
  });
  check("a won dispute cannot restore a fully refunded payment", () => {
    assert.equal(wonDisputePaymentStatus(0, 25_000), StripePaymentStatus.PAID);
    assert.equal(
      wonDisputePaymentStatus(25_000, 25_000),
      StripePaymentStatus.REFUNDED
    );
  });
  const stripe = new Stripe("sk_test_signature_check", { apiVersion: STRIPE_API_VERSION });
  const webhookBody = JSON.stringify({ id: "evt_signature_check", type: "checkout.session.completed" });
  const webhookHeader = stripe.webhooks.generateTestHeaderString({
    payload: webhookBody,
    secret: "whsec_signature_check",
  });
  check("Stripe webhook verification requires the untouched signed body", () => {
    assert.equal(
      stripe.webhooks.constructEvent(
        webhookBody,
        webhookHeader,
        "whsec_signature_check"
      ).id,
      "evt_signature_check"
    );
    assert.throws(() =>
      stripe.webhooks.constructEvent(
        `${webhookBody} `,
        webhookHeader,
        "whsec_signature_check"
      )
    );
  });

  console.log("\npasswords");
  const hash = await hashPassword("correct horse battery staple");
  check("hash is scrypt format", () => assert.match(hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/));
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  passed += 1;
  console.log("  ok  correct password verifies");
  assert.equal(await verifyPassword("wrong password", hash), false);
  passed += 1;
  console.log("  ok  wrong password rejected");

  console.log("\nstorage");
  // Use isolated scratch storage: open PDF viewers may lock the real .data
  // directory on Windows, and test fixtures must never touch user exports.
  if (process.env.DATABASE_URL) throw new Error("Run storage checks without DATABASE_URL; tests must never write to production.");
  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "kti-check-"));
  const dataDir = path.join(scratchDir, "data");
  const live = path.join(dataDir, "store.json");
  assert.ok(path.resolve(dataDir).startsWith(path.resolve(scratchDir) + path.sep));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTestPath = process.env.KTI_TEST_STORE_PATH;
  Object.assign(process.env, { NODE_ENV: "test", KTI_TEST_STORE_PATH: live });
  try {

  const { db } = await import("../lib/db");
  const registered = await db.createStudentWithEnrollment(
    {
      fullName: "Test Student",
      email: "Test@Example.com",
      country: "Nigeria",
      passwordHash: hash,
    },
    {
      product: "advanced",
      plan: "advanced",
      status: "pending",
      amount: 1000,
      currency: "USD",
      provider: null,
      providerRef: null,
    }
  );
  const { student, enrollment } = registered;
  check("registration creates student and enrollment together", () =>
    assert.equal(enrollment.studentId, student.id)
  );
  check("student is created", () => assert.ok(student.id));
  check("email is normalized", () => assert.equal(student.email, "test@example.com"));
  check("public registration creates a student role", () => assert.equal(student.role, "student"));
  const byEmail = await db.getStudentByEmail("TEST@EXAMPLE.COM");
  check("lookup is case-insensitive", () => assert.equal(byEmail?.id, student.id));

  // Password changes: self-service on /dashboard and admin reset on /admin both
  // land on the same store call, so that is what gets covered here.
  const replacement = await hashPassword("a different pass phrase");
  await db.updateStudentPassword(student.id, replacement);
  const afterChange = await db.getStudentById(student.id);
  const newVerifies = await verifyPassword("a different pass phrase", afterChange!.passwordHash);
  const oldVerifies = await verifyPassword("correct horse battery staple", afterChange!.passwordHash);
  check("password change replaces the stored hash", () =>
    assert.notEqual(afterChange?.passwordHash, hash)
  );
  check("the new password verifies", () => assert.ok(newVerifies));
  check("the old password stops working", () => assert.equal(oldVerifies, false));
  const token = issuePasswordResetToken(student.id, replacement);
  check("reset links authorize only the matching account and password version", () => {
    assert.ok(verifyPasswordResetToken(token, student.id, replacement));
    assert.equal(verifyPasswordResetToken(token, student.id, hash), false);
    assert.equal(verifyPasswordResetToken(token, "other-account", replacement), false);
    assert.equal(verifyPasswordResetToken(`${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`, student.id, replacement), false);
  });
  check("reset links expire after thirty minutes and reject malformed values", () => {
    assert.equal(resetTokenStudentId(token, Date.now() + RESET_LIFETIME_MS), null);
    for (const malformed of ["", "abc", ".".repeat(500), token.replace(/\.\d{13}\./, ".NaN.")]) assert.equal(resetTokenStudentId(malformed), null);
    assert.notEqual(token, issuePasswordResetToken(student.id, replacement));
  });
  const resetRace = await Promise.all([
    db.compareAndSetStudentPassword(student.id, replacement, hash),
    db.compareAndSetStudentPassword(student.id, replacement, hash),
  ]);
  check("concurrent reset redemptions succeed exactly once", () => assert.equal(resetRace.filter(Boolean).length, 1));
  const afterReset = await db.getStudentById(student.id);
  check("reset invalidates used links without changing the account role", () => {
    assert.equal(verifyPasswordResetToken(token, student.id, afterReset!.passwordHash), false);
    assert.equal(afterReset!.role, student.role);
  });
  const session = serialiseSession(student.id);
  check("password changes revoke old sessions and preserve newer sessions", () => {
    assert.equal(parseSession(session, new Date(Date.now() + 1).toISOString()), null);
    assert.equal(parseSession(session, new Date(Date.now() - 1000).toISOString()), student.id);
    assert.equal(parseSession(session), student.id);
  });
  const rateNow = new Date();
  const rateKey = resetRateKey("test", student.email);
  const allowed = await Promise.all(Array.from({ length: 5 }, () => db.takeAuthRateLimit(rateKey, 3, 60_000, rateNow)));
  check("reset request limits enforce a shared cap under concurrency", () => assert.equal(allowed.filter(Boolean).length, 3));
  const freshWindow = await db.takeAuthRateLimit(rateKey, 3, 60_000, new Date(rateNow.getTime() + 60_000));
  check("request limits recover after the time window", () => assert.equal(freshWindow, true));
  check("recovery email provides expiry and safely escapes the link", () => {
    const email = buildPasswordResetEmail('https://www.thekti.org/reset-password?token=x&test="value"');
    assert.ok(email.text.includes("30 minutes"));
    assert.ok(email.html.includes("&amp;test=&quot;value&quot;"));
    assert.ok(!email.html.includes('test="value"'));
  });
  await db.updateStudentPassword(student.id, hash);

  const everyone = await db.listStudents();
  check("admin roster lists every account", () =>
    assert.ok(everyone.some((person) => person.id === student.id))
  );

  await db.updateStudentRole(student.id, "staff");
  const promoted = await db.getStudentById(student.id);
  check("role change is persisted", () => assert.equal(promoted?.role, "staff"));
  check("promotion grants staff access", () => assert.ok(isStaff(promoted!)));
  await db.updateStudentRole(student.id, "admin");
  const asAdmin = await db.getStudentById(student.id);
  check("an admin can be created from the roster", () => assert.equal(asAdmin?.role, "admin"));
  await db.updateStudentRole(student.id, "student");
  const demoted = await db.getStudentById(student.id);
  check("demotion removes staff access", () => assert.equal(isStaff(demoted!), false));

  check("enrollment starts pending", () => assert.equal(enrollment.status, "pending"));
  const pendingEnrollments = await db.listPendingEnrollments();
  check("staff queue includes pending enrollment", () =>
    assert.equal(pendingEnrollments[0]?.student.email, student.email)
  );
  const grader = await db.createStudent({
    fullName: "Test Administrator",
    email: "admin@example.com",
    country: "United States",
    passwordHash: hash,
    role: "admin",
  });

  const scholarship = await db.createScholarshipApplication({
    enrollmentId: enrollment.id,
    studentId: student.id,
    financialNeed:
      "Tuition is not currently affordable because of my present financial responsibilities.",
    trainingGoals:
      "I plan to use the training to serve my church community with greater biblical clarity.",
    amountAbleToPay: 100,
  });
  check("newly registered prospect can submit a scholarship application", () => {
    assert.equal(scholarship?.status, "pending");
    assert.equal(scholarship?.amountAbleToPay, 100);
  });
  const duplicateScholarship = await db.createScholarshipApplication({
    enrollmentId: enrollment.id,
    studentId: student.id,
    financialNeed: "A duplicate application should not replace the original financial statement.",
    trainingGoals: "A duplicate application should not replace the original training goals.",
    amountAbleToPay: 0,
  });
  check("scholarship submission is idempotent per enrollment", () =>
    assert.equal(duplicateScholarship?.id, scholarship?.id)
  );
  const scholarshipQueue = await db.listScholarshipApplications();
  const registrationScholarships = await db.listRegistrationScholarships();
  check("registration grouping reads only scholarship owner and status, not private essays", () => {
    assert.deepEqual(registrationScholarships, [{ studentId: student.id, status: "pending" }]);
  });
  check("staff scholarship queue includes applicant and enrollment", () => {
    assert.equal(scholarshipQueue[0]?.student.email, student.email);
    assert.equal(scholarshipQueue[0]?.enrollment.id, enrollment.id);
  });
  const approvedScholarship = await db.reviewScholarshipApplication({
    applicationId: scholarship?.id ?? "",
    reviewerId: grader.id,
    decision: "approved",
    adminNotes: "Approved for full tuition support.",
  });
  check("scholarship approval records the private staff decision", () => {
    assert.equal(approvedScholarship?.status, "approved");
    assert.equal(approvedScholarship?.reviewedById, grader.id);
    assert.equal(approvedScholarship?.adminNotes, "Approved for full tuition support.");
  });
  const scholarshipEnrollment = (await db.getEnrollmentsForStudent(student.id)).find(
    (item) => item.id === enrollment.id
  );
  check("scholarship approval activates only its enrollment", () => {
    assert.equal(scholarshipEnrollment?.status, "active");
    assert.equal(scholarshipEnrollment?.provider, "scholarship");
    assert.equal(scholarshipEnrollment?.providerRef, scholarship?.id);
  });

  const manualEnrollment = await db.createEnrollment({
    studentId: student.id,
    product: module.slug,
    plan: "certificate",
    status: "pending",
    amount: 250,
    currency: "USD",
    provider: null,
    providerRef: null,
  });
  const activated = await db.activateEnrollment(manualEnrollment.id, "test_ref_123");
  check("manual enrollment activation remains available", () =>
    assert.equal(activated?.status, "active")
  );
  const registrations = await db.listEnrollments();
  check("staff roster retains activated registrations", () => {
    const registration = registrations.find((item) => item.id === manualEnrollment.id);
    assert.equal(registration?.student.email, student.email);
    assert.equal(registration?.status, "active");
    assert.equal(registration?.providerRef, "test_ref_123");
  });

  const declinedEnrollment = await db.createEnrollment({
    studentId: student.id,
    product: curriculum.modules[1].slug,
    plan: "certificate",
    status: "pending",
    amount: 250,
    currency: "USD",
    provider: null,
    providerRef: null,
  });
  const declinedApplication = await db.createScholarshipApplication({
    enrollmentId: declinedEnrollment.id,
    studentId: student.id,
    financialNeed: "This second request exercises the staff decline workflow in storage checks.",
    trainingGoals: "The requested course would support future service and personal Bible study.",
    amountAbleToPay: 25,
  });
  const declinedScholarship = await db.reviewScholarshipApplication({
    applicationId: declinedApplication?.id ?? "",
    reviewerId: grader.id,
    decision: "declined",
    adminNotes: "No award available in this review cycle.",
  });
  const stillPendingEnrollment = (await db.getEnrollmentsForStudent(student.id)).find(
    (item) => item.id === declinedEnrollment.id
  );
  check("declining a scholarship leaves payment available", () => {
    assert.equal(declinedScholarship?.status, "declined");
    assert.equal(stillPendingEnrollment?.status, "pending");
  });

  const racedEnrollment = await db.createEnrollment({
    studentId: student.id,
    product: curriculum.modules[2].slug,
    plan: "certificate",
    status: "pending",
    amount: 250,
    currency: "USD",
    provider: null,
    providerRef: null,
  });
  const racedApplication = await db.createScholarshipApplication({
    enrollmentId: racedEnrollment.id,
    studentId: student.id,
    financialNeed: "This request verifies that two staff decisions cannot both win concurrently.",
    trainingGoals: "The course would support future church teaching and personal Bible study.",
    amountAbleToPay: 50,
  });
  const racedReviews = await Promise.all([
    db.reviewScholarshipApplication({
      applicationId: racedApplication?.id ?? "",
      reviewerId: grader.id,
      decision: "approved",
      adminNotes: "Concurrent approval attempt.",
    }),
    db.reviewScholarshipApplication({
      applicationId: racedApplication?.id ?? "",
      reviewerId: grader.id,
      decision: "declined",
      adminNotes: "Concurrent decline attempt.",
    }),
  ]);
  const winningReviews = racedReviews.filter((result) => result !== null);
  const storedRacedApplication = await db.getScholarshipApplicationForEnrollment(
    racedEnrollment.id,
    student.id
  );
  check("concurrent scholarship reviews produce exactly one winner", () =>
    assert.equal(winningReviews.length, 1)
  );
  check("the stored scholarship decision matches the concurrent winner", () =>
    assert.equal(storedRacedApplication?.status, winningReviews[0]?.status)
  );

  await db.markLessonComplete(student.id, "st-101-1");
  await db.markLessonComplete(student.id, "st-101-1");
  const progress = await db.getProgress(student.id);
  check("progress is idempotent", () => assert.equal(progress.length, 1));

  await db.createQuizAttempt({
    studentId: student.id,
    courseSlug: "st-101",
    lessonId: "st-101-1",
    kind: "topic",
    correct: 4,
    total: 5,
    scorePct: 80,
    passed: true,
    answers: [0, 1, 2, 3, 0],
  });
  const hasPassingAttempt = await db.hasPassingTopicAttempt(student.id, "st-101-1");
  check("passing topic attempt is recorded server-side", () =>
    assert.equal(hasPassingAttempt, true)
  );

  const assessment = await db.createAssessmentSubmission({
    studentId: student.id,
    courseSlug: "st-101",
    sectionACorrect: 18,
    sectionATotal: 20,
    sectionAPoints: 36,
  });
  check("published module guide does not repeat the page-level heading", () => {
    assert.equal(moduleDoc.ready, true);
    assert.ok(!moduleDoc.html.includes("<h1"));
    assert.ok(moduleDoc.html.includes("Module Learning Outcomes"));
  });
  check("unfinished module guides do not expose authoring placeholders or draft links", () => {
    for (const upcoming of getCurriculum().modules.slice(1)) {
      const guide = getModuleDoc(upcoming);
      assert.equal(guide.ready, false);
      assert.equal(guide.html, "");
    }
  });
  await db.createQuizAttempt({
    studentId: student.id, courseSlug: "st-101", lessonId: null,
    kind: "course-assessment", correct: 1, total: 2, scorePct: 50, passed: false,
    answers: [{ questionId: "question-one", answer: "A" }, { questionId: "question-two", answer: "B" }],
  });
  const previousQuestionIds = await db.getLatestAssessmentQuestionIds(student.id, "st-101");
  check("retakes recover the last submitted question IDs, excluding topic quizzes", () =>
    assert.deepEqual(previousQuestionIds, ["question-one", "question-two"])
  );
  const otherCourseQuestionIds = await db.getLatestAssessmentQuestionIds(student.id, "st-102");
  check("retake history is scoped to the course", () => assert.deepEqual(otherCourseQuestionIds, []));
  await db.submitAssessmentWrittenWork(
    assessment.id,
    student.id,
    "A complete set of clearly labelled written responses for instructor review."
  );
  const pendingAssessments = await db.listPendingAssessments();
  check("written assessment enters the staff grading queue", () =>
    assert.equal(pendingAssessments[0]?.id, assessment.id)
  );
  const overwritten = await db.submitAssessmentWrittenWork(assessment.id, student.id, "Replacement text");
  check("submitted written work cannot be overwritten", () => assert.equal(overwritten, null));
  const graded = await db.gradeAssessment({
    id: assessment.id,
    graderId: grader.id,
    writtenPoints: 50,
    feedback: "Strong work.",
  });
  check("instructor grading calculates the final score", () =>
    assert.equal(graded?.totalScore, 86)
  );

  const communityPost = await db.createCommunityPost({
    moduleSlug: module.slug,
    studentId: student.id,
    body: "This is a thoughtful reflection on the first module lesson.",
  });
  check("community post starts without automatic extra credit", () =>
    assert.equal(communityPost.engagementCredits, 0)
  );
  const communityPosts = await db.getCommunityPosts(module.slug);
  check("community posts are scoped to the module", () =>
    assert.equal(communityPosts.length, 1)
  );
  await db.moderateCommunityPost({
    postId: communityPost.id,
    moderatorId: grader.id,
    hidden: false,
    engagementCredits: 2,
  });
  const engagement = await db.getCommunityEngagement(student.id);
  check("staff-awarded engagement credits are tracked separately", () =>
    assert.deepEqual(engagement, { posts: 1, credits: 2 })
  );

  const lessonPost = await db.createCommunityPost({ moduleSlug: module.slug, lessonId: "st-101-1", studentId: student.id, body: "A question for this particular lesson only." });
  await db.createCommunityPost({ moduleSlug: module.slug, lessonId: "st-101-2", studentId: student.id, body: "A different question for lesson two." });
  check("lesson discussions persist separately from general and neighboring lesson conversations", () => assert.equal(lessonPost.lessonId, "st-101-1"));
  assert.equal((await db.getCommunityPosts(module.slug)).length, 1);
  assert.deepEqual((await db.getCommunityPosts(module.slug, "st-101-1")).map((post) => post.id), [lessonPost.id]);
  assert.equal((await db.getCommunityPosts("02-biblical-foundations", "st-101-1")).length, 0);
  await db.moderateCommunityPost({ postId: lessonPost.id, moderatorId: grader.id, hidden: true, engagementCredits: 0 });
  check("staff moderation hides a lesson contribution from the student feed", () => assert.ok(lessonPost.id));
  assert.equal((await db.getCommunityPosts(module.slug, "st-101-1")).length, 0);

  await fs.rm(live, { force: true });

  // Serverless hosts have a read-only filesystem. Simulate that by putting a
  // FILE where the .data directory must be, so mkdir fails, and confirm the
  // store reports it as a known condition rather than an opaque crash.
  console.log("\nread-only filesystem handling");
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.writeFile(dataDir, "blocked", "utf8");
  const { StorageUnavailableError } = await import("../lib/db/types");
  let caught: unknown = null;
  try {
    await db.createStudent({
      fullName: "Blocked",
      email: "blocked@example.com",
      country: "Nigeria",
      passwordHash: hash,
    });
  } catch (err) {
    caught = err;
  }
  await fs.rm(dataDir, { force: true });
  check("write failure raises StorageUnavailableError", () =>
    assert.ok(caught instanceof StorageUnavailableError, `got ${caught}`)
  );

  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    if (previousTestPath === undefined) delete process.env.KTI_TEST_STORE_PATH;
    else process.env.KTI_TEST_STORE_PATH = previousTestPath;
  }
  await fs.rm(scratchDir, { recursive: true, force: true });

  console.log(`\n${passed} checks passed\n`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
