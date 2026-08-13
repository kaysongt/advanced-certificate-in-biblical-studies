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

import { hashPassword, verifyPassword } from "../lib/auth-core";
import {
  entitlementRedirectPath,
  getModuleEnrollmentState,
  hasActiveAccess,
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
import { isPrimaryRouteActive, PRIMARY_NAV_ITEMS } from "../lib/navigation";
import { getStripeCatalogItem } from "../lib/payments/catalog";
import { buildCheckoutSessionParams } from "../lib/payments/checkout-session";
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
        ["Systematic Theology", "2026-09-01", "September 1, 2026"],
        ["Biblical Foundations", "2026-11-01", "November 1, 2026"],
        ["Old Testament Survey", "2027-01-01", "January 1, 2027"],
        ["New Testament Survey", "2027-03-01", "March 1, 2027"],
        ["Spiritual Formation", "2027-05-01", "May 1, 2027"],
      ]
    )
  );
  check("Module I opens at midnight Chicago time on September 1", () => {
    assert.equal(isModuleReleased(curriculum.modules[0], new Date("2026-09-01T04:59:59Z")), false);
    assert.equal(isModuleReleased(curriculum.modules[0], new Date("2026-09-01T05:00:00Z")), true);
  });
  check("all scheduled modules can be purchased before release", () =>
    assert.deepEqual(
      getPurchasableModules().map((item) => item.slug),
      curriculum.modules.map((item) => item.slug)
    )
  );

  console.log("\nnavigation");
  check("primary tabs point to distinct routes", () =>
    assert.deepEqual(
      PRIMARY_NAV_ITEMS.map((item) => [item.label, item.href]),
      [
        ["Curriculum", "/curriculum"],
        ["Pricing", "/pricing"],
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
    const launch = getModuleStatuses(new Date("2026-09-01T12:00:00Z"));
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
    assert.equal(checkoutParams.customer_email, "checkout-check@example.com");
    assert.equal(checkoutParams.success_url, "https://www.thekti.org/dashboard?payment=success");
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
  // Exercise the dev adapter against a scratch file, then clean up.
  const dataDir = path.join(process.cwd(), ".data");
  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "kti-check-"));
  const backup = path.join(scratchDir, "store.json.bak");
  const live = path.join(dataDir, "store.json");
  let hadExisting = false;
  try {
    await fs.copyFile(live, backup);
    hadExisting = true;
  } catch {
    /* nothing to preserve */
  }
  await fs.rm(live, { force: true });

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
  check("student can submit a scholarship application for a pending enrollment", () => {
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
  await db.submitAssessmentWrittenWork(
    assessment.id,
    student.id,
    "A complete set of clearly labelled written responses for instructor review."
  );
  const pendingAssessments = await db.listPendingAssessments();
  check("written assessment enters the staff grading queue", () =>
    assert.equal(pendingAssessments[0]?.id, assessment.id)
  );
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

  if (hadExisting) {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.rename(backup, live);
  }
  await fs.rm(scratchDir, { recursive: true, force: true });

  console.log(`\n${passed} checks passed\n`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
