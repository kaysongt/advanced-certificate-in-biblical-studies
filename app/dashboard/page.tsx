import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import StripeCheckoutButton from "@/components/StripeCheckoutButton";
import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { getModuleStatuses } from "@/lib/content";
import { db } from "@/lib/db";
import { getCurriculum, moduleReleaseLabel } from "@/lib/curriculum";
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
  searchParams: Promise<{ payment?: string }>;
}) {
  const student = await currentStudent();
  if (!student) redirect("/login");

  const { payment } = await searchParams;
  const { program, grading } = getCurriculum();
  const [enrollments, progress, engagement] = await Promise.all([
    db.getEnrollmentsForStudent(student.id),
    db.getProgress(student.id),
    db.getCommunityEngagement(student.id),
  ]);
  const statuses = getModuleStatuses();

  const pending = enrollments.filter((e) => e.status === "pending");
  const stripeConfigured = isStripeCheckoutConfigured();
  const paymentAttempts = await listLatestStripePaymentAttempts(
    pending.map((enrollment) => enrollment.id)
  );
  const moduleNames = new Map(
    getCurriculum().modules.map((module) => [module.slug, module.short_title])
  );
  const paymentMessage = payment ? paymentMessages[payment] : null;
  const paymentDetails = {
    accountName: process.env.PAYMENT_BANK_ACCOUNT_NAME?.trim(),
    bankName: process.env.PAYMENT_BANK_NAME?.trim(),
    accountNumber: process.env.PAYMENT_BANK_ACCOUNT_NUMBER?.trim(),
    routingNumber: process.env.PAYMENT_BANK_ROUTING_NUMBER?.trim(),
  };
  const canShowPaymentDetails = Object.values(paymentDetails).every(Boolean);

  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">{program.institute}</div>
        <h1>Welcome, {student.fullName.split(" ")[0]}</h1>
        <p className="deck">
          {progress.length} {progress.length === 1 ? "topic" : "topics"} completed.
        </p>
      </div>

      {pending.length ? (
        <section className="pending-payment" aria-labelledby="pending-payment-title">
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
                  </div>
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
          const unlocked = hasActiveAccess(enrollments, module.slug);
          return (
            <div className="card" key={module.slug}>
              <div className="cardtop">
                <span className="eyebrow">
                  Module {module.numeral} &middot; {module.hours} hrs
                </span>
                <span className={`avail ${available && unlocked ? "now" : "soon"}`}>
                  {!unlocked
                    ? "Not enrolled"
                    : available
                      ? "Ready"
                      : moduleReleaseLabel(module)}
                </span>
              </div>
              <span className="t">{module.short_title}</span>
              <p>{module.catalog_blurb}</p>
              <span className="foot">
                {unlocked && available ? (
                  <Link href={`/curriculum/${module.slug}`}>Start studying →</Link>
                ) : !unlocked ? (
                  <Link href="/enroll">Add this certificate →</Link>
                ) : (
                  moduleReleaseLabel(module)
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

      <form action={signOut} style={{ marginTop: 44 }}>
        <button type="submit" className="btn">
          Sign out
        </button>
      </form>
    </main>
  );
}
