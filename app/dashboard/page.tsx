import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { changeOwnPassword } from "./actions";
import StripeCheckoutButton from "@/components/StripeCheckoutButton";
import { getModuleEnrollmentState } from "@/lib/access";
import { currentStudent, isStaff } from "@/lib/auth";
import { getModuleStatuses } from "@/lib/content";
import { db } from "@/lib/db";
import {
  formatModuleReleaseDate,
  getCurriculum,
  moduleReleaseLabel,
} from "@/lib/curriculum";
import { promotionCodesAllowed } from "@/lib/payments/promotions";
import { isStripeCheckoutConfigured } from "@/lib/payments/stripe-client";
import {
  listLatestStripePaymentAttempts,
  type StripePaymentAttemptSummary,
} from "@/lib/payments/stripe-store";

import { beginStripeCheckout } from "./actions";

export const metadata: Metadata = {
  title: "My studies",
  robots: { index: false, follow: false },
};

const passwordMessages: Record<string, { tone: "good" | "warn" | "bad"; text: string }> = {
  changed: { tone: "good", text: "Your password has been updated." },
  wrong: { tone: "bad", text: "That current password is not right. Nothing was changed." },
  same: { tone: "warn", text: "The new password matches your current one. Choose a different one." },
  invalid: {
    tone: "bad",
    text: "Check the form: the new password needs at least 10 characters and both new fields must match.",
  },
};

const paymentMessages: Record<string, { tone: "good" | "warn" | "bad"; text: string }> = {
  required: {
    tone: "warn",
    text: "Your place is reserved, but tuition has not been paid yet. Complete payment below to unlock your study material.",
  },
  success: {
    tone: "good",
    text: "Payment was submitted securely. Stripe is confirming it now; access updates automatically after the signed confirmation arrives.",
  },
  processing: {
    tone: "warn",
    text: "Your Checkout Session is complete and payment confirmation is still processing. You do not need to pay again.",
  },
  cancelled: {
    tone: "warn",
    text: "Checkout was cancelled and no new access was granted. You can resume secure payment below.",
  },
  invalid: { tone: "bad", text: "That enrollment could not be opened for payment." },
  unavailable: {
    tone: "bad",
    text: "Secure card payment is temporarily unavailable. Please try again or use the bank-transfer option below.",
  },
  "scholarship-submitted": {
    tone: "good",
    text: "Your scholarship application was submitted. The KingsWord team can now review it in the staff dashboard.",
  },
};

const paymentStatusLabels: Record<StripePaymentAttemptSummary["status"], string> = {
  created: "Starting checkout",
  open: "Checkout ready",
  processing: "Payment processing",
  paid: "Paid",
  failed: "Payment failed",
  expired: "Checkout expired",
  "partially-refunded": "Partially refunded",
  refunded: "Refunded",
  disputed: "Payment under review",
};

function tuition(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; password?: string }>;
}) {
  const student = await currentStudent();
  if (!student) redirect("/login");

  const { payment, password } = await searchParams;
  const { program, grading } = getCurriculum();
  const [enrollments, progress, engagement, scholarshipApplications] = await Promise.all([
    db.getEnrollmentsForStudent(student.id),
    db.getProgress(student.id),
    db.getCommunityEngagement(student.id),
    db.getScholarshipApplicationsForStudent(student.id),
  ]);
  const statuses = getModuleStatuses();

  const pending = enrollments.filter((e) => e.status === "pending");
  const stripeConfigured = isStripeCheckoutConfigured();
  const paymentAttempts = await listLatestStripePaymentAttempts(
    pending.map((enrollment) => enrollment.id)
  );
  const scholarshipsByEnrollment = new Map(
    scholarshipApplications.map((application) => [application.enrollmentId, application])
  );
  const moduleNames = new Map(
    getCurriculum().modules.map((module) => [module.slug, module.short_title])
  );
  const paymentMessage = payment ? paymentMessages[payment] : null;
  const passwordMessage = password ? passwordMessages[password] : null;
  const paymentDetails = {
    accountName: process.env.PAYMENT_BANK_ACCOUNT_NAME?.trim(),
    bankName: process.env.PAYMENT_BANK_NAME?.trim(),
    accountNumber: process.env.PAYMENT_BANK_ACCOUNT_NUMBER?.trim(),
    routingNumber: process.env.PAYMENT_BANK_ROUTING_NUMBER?.trim(),
  };
  const canShowPaymentDetails = Object.values(paymentDetails).every(Boolean);

  // A student who has paid but whose first module has not opened yet is in a
  // real state of its own: nothing to pay, nothing to study, and a date to
  // wait for. Without this they were told only how many topics they had
  // completed, which reads as zero progress rather than "you are in".
  const activeStatuses = statuses.filter(
    ({ module }) => getModuleEnrollmentState(enrollments, module.slug) === "active"
  );
  const openNow = activeStatuses.filter((status) => status.available);
  const nextOpening =
    activeStatuses
      .filter((status) => !status.available)
      .sort((a, b) => a.module.release_date.localeCompare(b.module.release_date))[0] ?? null;
  const awaitingFirstModule = Boolean(nextOpening) && openNow.length === 0;

  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">{program.institute}</div>
        <h1>Welcome, {student.fullName.split(" ")[0]}</h1>
        <p className="deck">
          {progress.length
            ? `${progress.length} ${progress.length === 1 ? "topic" : "topics"} completed.`
            : awaitingFirstModule
              ? "Your place is confirmed. Nothing else is needed from you before study opens."
              : "Your studies start here."}
        </p>
      </div>

      {isStaff(student) ? (
        <Link href="/admin" className="staff-entry">
          <span className="staff-entry-label">
            {student.role === "admin" ? "Administrator" : "Staff"} access
          </span>
          <strong>Open operations</strong>
          <span className="staff-entry-hint">
            Registrations, payments, scholarships, grading, and every account on the course.
          </span>
        </Link>
      ) : null}

      {/*
        * One panel serving two states. A student still owing tuition gets the
        * orientation video framed as a welcome; a paid student waiting on the
        * release gets the opening date instead, because "complete payment to
        * unlock" is the wrong thing to say to someone who has already paid.
        */}
      {enrollments.length ? (
        <section
          className={`welcome-video${awaitingFirstModule ? " is-enrolled" : ""}`}
          aria-labelledby="welcome-video-title"
        >
          <div className="welcome-video-copy">
            <div className="eyebrow">
              {awaitingFirstModule ? "You are enrolled" : "Start here"}
            </div>
            <h2 id="welcome-video-title">
              {awaitingFirstModule && nextOpening
                ? `${nextOpening.module.short_title} opens ${formatModuleReleaseDate(nextOpening.module)}`
                : program.welcome_video?.title ?? "Thank you for registering"}
            </h2>
            <p>
              {awaitingFirstModule
                ? `Your access is already paid and reserved. Module ${nextOpening?.module.numeral} unlocks on release day and appears here automatically — watch the orientation below in the meantime.`
                : `A short orientation from the Institute on what the ${program.title} covers and how to get the most from it.`}
            </p>
            {program.welcome_video?.speaker ? (
              <p className="welcome-video-meta">
                <strong>{program.welcome_video.speaker}</strong>
                {program.welcome_video.duration ? (
                  <>
                    <span aria-hidden="true">&middot;</span>
                    {program.welcome_video.duration}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          {program.welcome_video?.url ? (
            <div className="welcome-video-frame">
              <video
                src={program.welcome_video.url}
                poster={program.welcome_video.poster ?? undefined}
                controls
                playsInline
                preload="metadata"
                aria-label={program.welcome_video.title ?? "Thank you for registering"}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {pending.length ? (
        <section
          id="complete-payment"
          className="pending-payment"
          aria-labelledby="pending-payment-title"
        >
          <div className="payment-heading">
            <div>
              <div className="eyebrow">Enrollment reserved</div>
              <h2 id="pending-payment-title">Complete your payment</h2>
            </div>
            <span className="secure-payment-mark">
              {stripeConfigured ? "Secure checkout by Stripe" : "Bank transfer available"}
            </span>
          </div>
          <p>Your account is ready. Choose secure card checkout or use the bank-transfer option.</p>

          {paymentMessage ? (
            <div className={`notice ${paymentMessage.tone}`} role="status">
              {paymentMessage.text}
            </div>
          ) : null}

          <div className="pending-enrollment-list">
            {pending.map((enrollment) => {
              const attempt = paymentAttempts.get(enrollment.id);
              const paymentInFlight = attempt?.status === "processing";
              const staffReview =
                attempt?.needsReview ||
                attempt?.status === "partially-refunded" ||
                attempt?.status === "disputed";
              const canOpenCheckout = stripeConfigured && !paymentInFlight && !staffReview;
              const scholarship = scholarshipsByEnrollment.get(enrollment.id);
              return (
                <article className="pending-enrollment" key={enrollment.id}>
                  <div>
                    <span className="pending-enrollment-plan">
                      {enrollment.plan === "advanced" ? "Full program" : "Single certificate"}
                    </span>
                    <h3>
                      {enrollment.product === "advanced"
                        ? "Advanced Certificate in Biblical Studies"
                        : moduleNames.get(enrollment.product) ?? enrollment.product}
                    </h3>
                    <strong>{tuition(enrollment.amount, enrollment.currency)}</strong>
                    {attempt ? (
                      <span className={`payment-state ${attempt.status}`}>
                        {paymentStatusLabels[attempt.status]}
                      </span>
                    ) : null}
                    {canOpenCheckout && promotionCodesAllowed(enrollment.plan) ? (
                      <span className="promo-code-note">
                        Have a promo code? Enter it on the Stripe checkout page to see your
                        discount before you pay.
                      </span>
                    ) : null}
                  </div>
                  <div className="pending-enrollment-actions">
                    {canOpenCheckout ? (
                      <form action={beginStripeCheckout}>
                        <input type="hidden" name="enrollmentId" value={enrollment.id} />
                        <StripeCheckoutButton />
                      </form>
                    ) : paymentInFlight ? (
                      <p className="payment-processing-note">
                        Confirmation is in progress. Please do not submit another payment.
                      </p>
                    ) : staffReview ? (
                      <p className="payment-processing-note">
                        The KingsWord team is reviewing this payment. No further payment is needed.
                      </p>
                    ) : (
                      <p className="payment-processing-note">
                        Online checkout is being configured. Bank transfer remains available.
                      </p>
                    )}
                    <div className={`scholarship-payment-option${scholarship ? ` ${scholarship.status}` : ""}`}>
                      {scholarship?.status === "pending" ? (
                        <>
                          <strong>Scholarship under review</strong>
                          <Link href={`/scholarship?enrollment=${enrollment.id}`}>View application status</Link>
                        </>
                      ) : scholarship?.status === "declined" ? (
                        <>
                          <strong>Scholarship application reviewed</strong>
                          <Link href={`/scholarship?enrollment=${enrollment.id}`}>View decision and payment options</Link>
                        </>
                      ) : (
                        <>
                          <span>Unable to afford tuition?</span>
                          <Link href={`/scholarship?enrollment=${enrollment.id}`}>Apply for a scholarship</Link>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="payment-divider"><span>Bank transfer option</span></div>
          {canShowPaymentDetails ? (
            <>
              <dl className="payment-details">
                <div>
                  <dt>Account name</dt>
                  <dd>{paymentDetails.accountName}</dd>
                </div>
                <div>
                  <dt>Bank</dt>
                  <dd>{paymentDetails.bankName}</dd>
                </div>
                <div>
                  <dt>Account number</dt>
                  <dd>{paymentDetails.accountNumber}</dd>
                </div>
                <div>
                  <dt>Routing number</dt>
                  <dd>{paymentDetails.routingNumber}</dd>
                </div>
              </dl>
              <p className="payment-note">
                Use <strong>{student.email}</strong> as the transfer reference, then email your
                receipt to <a href={`mailto:${program.contact.email}`}>{program.contact.email}</a>.
              </p>
            </>
          ) : (
            <p>
              Contact <a href={`mailto:${program.contact.email}`}>{program.contact.email}</a> for
              payment instructions.
            </p>
          )}
        </section>
      ) : null}

      <h2>Your program</h2>
      <div className="cards five">
        {statuses.map(({ module, available }) => {
          const enrollmentState = getModuleEnrollmentState(enrollments, module.slug);
          const unlocked = enrollmentState === "active";
          const statusClass =
            unlocked && available
              ? "now"
              : enrollmentState === "pending"
                ? "reserved"
                : "soon";
          const statusLabel =
            enrollmentState === "none"
              ? "Not included"
              : enrollmentState === "pending"
                ? "Included"
                : enrollmentState === "suspended"
                  ? "Access on hold"
                  : available
                    ? "Ready"
                    : moduleReleaseLabel(module);
          const contactHref = `mailto:${program.contact.email}?subject=${encodeURIComponent(
            `Add ${module.short_title} certificate`
          )}`;
          return (
            <div className="card" key={module.slug}>
              <div className="cardtop">
                <span className="eyebrow">
                  Module {module.numeral} &middot; {module.hours} hrs
                </span>
                <span className={`avail ${statusClass}`}>{statusLabel}</span>
              </div>
              <span className="t">{module.short_title}</span>
              <p>{module.catalog_blurb}</p>
              <span className="foot">
                {unlocked && available ? (
                  <Link href={`/curriculum/${module.slug}`}>Start studying →</Link>
                ) : unlocked ? (
                  moduleReleaseLabel(module)
                ) : enrollmentState === "pending" ? (
                  <Link href="#complete-payment">Complete payment to unlock →</Link>
                ) : enrollmentState === "suspended" ? (
                  <a href={`mailto:${program.contact.email}`}>Contact KTI about access →</a>
                ) : (
                  <a href={contactHref}>Ask about adding this certificate →</a>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <h2 style={{ marginTop: 44 }}>How you are graded</h2>
      <p className="deck" style={{ maxWidth: "62ch" }}>
        You need <strong>{grading.pass_mark}%</strong> to pass. You cannot move on to the next
        topic or course until you have passed the one before it.
      </p>
      <div className="tablewrap" style={{ maxWidth: "62ch" }}>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {grading.components.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.weight}%</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Pass mark</strong>
              </td>
              <td>
                <strong>{grading.pass_mark}%</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="pillrow" style={{ marginTop: 14 }}>
        {grading.scale.map((s) => (
          <span className={`pill ${s.grade === "F" ? "quiet" : "ok"}`} key={s.grade}>
            {s.grade} &middot; {s.range}
          </span>
        ))}
      </div>

      <section className="dashboard-community">
        <div>
          <div className="eyebrow">Learning in community</div>
          <h2>Keep the conversation going.</h2>
          <p>
            You have recorded {engagement.posts} community {engagement.posts === 1 ? "contribution" : "contributions"}
            {" "}and {engagement.credits} engagement {engagement.credits === 1 ? "credit" : "credits"}.
            Thoughtful participation is encouraged and can be reviewed for extra-credit opportunities.
          </p>
        </div>
        <Link href="/community" className="btn quiet lg">
          Open community groups
        </Link>
      </section>

      <section className="panel" id="password" style={{ marginTop: 44, scrollMarginTop: 90 }}>
        <h2>Change your password</h2>
        <p>
          Choose something only you know, at least 10 characters. You will stay signed in on this
          device after the change.
        </p>

        {passwordMessage ? (
          <div className={`notice ${passwordMessage.tone}`} role="status">
            {passwordMessage.text}
          </div>
        ) : null}

        <form action={changeOwnPassword} className="password-form">
          <label htmlFor="currentPassword">Current password</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />

          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />

          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />

          <button type="submit" className="btn quiet">
            Update password
          </button>
        </form>
      </section>

      <form action={signOut} style={{ marginTop: 44 }}>
        <button type="submit" className="btn">
          Sign out
        </button>
      </form>
    </main>
  );
}
