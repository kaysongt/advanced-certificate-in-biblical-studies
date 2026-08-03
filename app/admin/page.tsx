import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentStudent, isStaff } from "@/lib/auth";
import { getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";
import {
  listLatestStripePaymentAttempts,
  type StripePaymentAttemptSummary,
} from "@/lib/payments/stripe-store";

import {
  activateEnrollment,
  gradeAssessment,
  moderateCommunityPost,
  reviewScholarshipApplication,
} from "./actions";

export const metadata: Metadata = {
  title: "Staff operations",
  robots: { index: false, follow: false },
};

const registrationDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
  timeZoneName: "short",
});

function tuition(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const paymentStatusLabels: Record<StripePaymentAttemptSummary["status"], string> = {
  created: "Checkout starting",
  open: "Checkout open",
  processing: "Payment processing",
  paid: "Stripe paid",
  failed: "Payment failed",
  expired: "Checkout expired",
  "partially-refunded": "Partial refund",
  refunded: "Refunded",
  disputed: "Disputed",
};

export default async function AdminPage() {
  const staff = await currentStudent();
  if (!staff || !isStaff(staff)) redirect("/");

  const [registrations, scholarships, assessments, posts] = await Promise.all([
    db.listEnrollments(),
    db.listScholarshipApplications(),
    db.listPendingAssessments(),
    db.listRecentCommunityPosts(),
  ]);
  const moduleNames = new Map(
    getCurriculum().modules.map((module) => [module.slug, module.short_title])
  );
  const paymentAttempts = await listLatestStripePaymentAttempts(
    registrations.map((enrollment) => enrollment.id)
  );
  const registrationCounts = {
    pending: registrations.filter((item) => item.status === "pending").length,
    active: registrations.filter(
      (item) => item.status === "active" && !item.accessSuspendedAt
    ).length,
    suspended: registrations.filter((item) => Boolean(item.accessSuspendedAt)).length,
    stripeReview: [...paymentAttempts.values()].filter((attempt) => attempt.needsReview).length,
  };
  const pendingScholarships = scholarships.filter((item) => item.status === "pending").length;

  return (
    <main className="shell admin-shell">
      <header className="pagehead">
        <div className="eyebrow">KingsWord team</div>
        <h1>Staff operations</h1>
        <p className="deck">
          Review scholarship requests and registrations, activate verified payments, grade
          submitted work, and moderate engagement.
        </p>
      </header>

      <section className="admin-section admin-scholarship-section">
        <div className="admin-section-head">
          <div>
            <h2>Scholarship applications</h2>
            <p>Private financial-assistance requests, with pending applications shown first.</p>
          </div>
          <span>{pendingScholarships}</span>
        </div>
        {scholarships.length ? (
          <div className="admin-list">
            {scholarships.map((application) => (
              <article className="admin-card admin-card-stack scholarship-review-card" key={application.id}>
                <div className="scholarship-review-head">
                  <div>
                    <div className="admin-registration-title">
                      <strong>{application.student.fullName}</strong>
                      <span className={`registration-status ${application.status}`}>
                        {application.status === "pending" ? "Awaiting review" : application.status}
                      </span>
                    </div>
                    <p>
                      <a href={`mailto:${application.student.email}`}>{application.student.email}</a>
                      <span aria-hidden="true"> &middot; </span>
                      {application.student.country}
                    </p>
                  </div>
                  <dl className="scholarship-review-meta">
                    <div>
                      <dt>Program</dt>
                      <dd>
                        {application.enrollment.product === "advanced"
                          ? "All five certificates"
                          : moduleNames.get(application.enrollment.product) ?? application.enrollment.product}
                      </dd>
                    </div>
                    <div>
                      <dt>Tuition</dt>
                      <dd>{tuition(application.enrollment.amount, application.enrollment.currency)}</dd>
                    </div>
                    <div>
                      <dt>Can contribute</dt>
                      <dd>{tuition(application.amountAbleToPay, application.enrollment.currency)}</dd>
                    </div>
                    <div>
                      <dt>Submitted</dt>
                      <dd>
                        <time dateTime={application.createdAt}>
                          {registrationDate.format(new Date(application.createdAt))}
                        </time>
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="scholarship-review-responses">
                  <div>
                    <span>Financial need</span>
                    <p>{application.financialNeed}</p>
                  </div>
                  <div>
                    <span>Training goals</span>
                    <p>{application.trainingGoals}</p>
                  </div>
                </div>

                {application.status === "pending" ? (
                  <form action={reviewScholarshipApplication} className="scholarship-review-form">
                    <input type="hidden" name="applicationId" value={application.id} />
                    <label>
                      Private staff note (optional)
                      <textarea
                        name="adminNotes"
                        rows={3}
                        maxLength={2000}
                        placeholder="Record the reason for the decision or any follow-up needed."
                      />
                    </label>
                    <div className="scholarship-review-actions">
                      {application.enrollment.status === "pending" ? (
                        <button className="btn primary" type="submit" name="decision" value="approved">
                          Approve and activate access
                        </button>
                      ) : (
                        <span className="admin-scholarship-paid">
                          Enrollment is already {application.enrollment.status}; approval is unavailable.
                        </span>
                      )}
                      <button className="btn" type="submit" name="decision" value="declined">
                        Decline application
                      </button>
                    </div>
                    <p className="admin-form-note">
                      Approval grants a full tuition scholarship for this enrollment. Private notes
                      are visible only to staff.
                    </p>
                  </form>
                ) : (
                  <div className="scholarship-decision-record">
                    <span>
                      Reviewed {application.reviewedAt
                        ? registrationDate.format(new Date(application.reviewedAt))
                        : "by staff"}
                    </span>
                    <p>{application.adminNotes || "No private note was recorded."}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-empty">No scholarship application has been submitted.</p>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <h2>Student registrations</h2>
            <p>Everyone who has registered through the website, newest first.</p>
          </div>
          <span>{registrations.length}</span>
        </div>
        <div className="admin-registration-summary" aria-label="Registration totals">
          <span>
            <strong>{registrations.length}</strong> Total
          </span>
          <span>
            <strong>{registrationCounts.pending}</strong> Awaiting payment
          </span>
          <span>
            <strong>{registrationCounts.active}</strong> Active
          </span>
          <span>
            <strong>{registrationCounts.stripeReview}</strong> Payment review
          </span>
          <span>
            <strong>{registrationCounts.suspended}</strong> Access suspended
          </span>
        </div>
        {registrations.length ? (
          <div className="admin-list">
            {registrations.map((enrollment) => {
              const paymentAttempt = paymentAttempts.get(enrollment.id);
              return (
              <article className="admin-card admin-registration-card" key={enrollment.id}>
                <div className="admin-registration-person">
                  <div className="admin-registration-title">
                    <strong>{enrollment.student.fullName}</strong>
                    <span
                      className={`registration-status ${
                        enrollment.accessSuspendedAt ? "suspended" : enrollment.status
                      }`}
                    >
                      {enrollment.accessSuspendedAt
                        ? "Access suspended"
                        : enrollment.status === "pending"
                          ? "Awaiting payment"
                          : enrollment.status}
                    </span>
                  </div>
                  <p>
                    <a href={`mailto:${enrollment.student.email}`}>{enrollment.student.email}</a>
                    <span aria-hidden="true"> &middot; </span>
                    {enrollment.student.country}
                  </p>
                  <dl className="admin-registration-meta">
                    <div>
                      <dt>Registration</dt>
                      <dd>
                        <time dateTime={enrollment.createdAt}>
                          {registrationDate.format(new Date(enrollment.createdAt))}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>Plan</dt>
                      <dd>
                        {enrollment.plan === "advanced" ? "Full program" : "Single certificate"}
                      </dd>
                    </div>
                    <div>
                      <dt>Program</dt>
                      <dd>
                        {enrollment.product === "advanced"
                          ? "All five certificates"
                          : moduleNames.get(enrollment.product) ?? enrollment.product}
                      </dd>
                    </div>
                    <div>
                      <dt>Tuition</dt>
                      <dd>{tuition(enrollment.amount, enrollment.currency)}</dd>
                    </div>
                    <div>
                      <dt>Online payment</dt>
                      <dd>
                        {paymentAttempt
                          ? paymentStatusLabels[paymentAttempt.status]
                          : "No Stripe attempt"}
                      </dd>
                    </div>
                  </dl>
                </div>
                {enrollment.status === "pending" ? (
                  <div className="admin-payment-column">
                    {paymentAttempt ? (
                      <div className={`admin-stripe-state${paymentAttempt.needsReview ? " review" : ""}`}>
                        <span>{paymentStatusLabels[paymentAttempt.status]}</span>
                        {paymentAttempt.needsReview ? (
                          <small>{paymentAttempt.reviewReason ?? "Staff review required."}</small>
                        ) : null}
                      </div>
                    ) : null}
                    <form action={activateEnrollment} className="admin-inline-form">
                      <input type="hidden" name="enrollmentId" value={enrollment.id} />
                      <label>
                        Bank payment or invoice reference
                        <input name="paymentReference" required minLength={3} maxLength={120} />
                      </label>
                      <button className="btn primary" type="submit">Activate manual payment</button>
                    </form>
                  </div>
                ) : (
                  <div className="admin-registration-payment">
                    <span>
                      {enrollment.status === "active" ? "Access activated" : "Enrollment closed"}
                    </span>
                    <strong>{enrollment.providerRef ?? "No payment reference recorded"}</strong>
                    {enrollment.provider ? <small>Recorded via {enrollment.provider}</small> : null}
                    {paymentAttempt ? (
                      <small>
                        Stripe: {paymentStatusLabels[paymentAttempt.status]}
                        {paymentAttempt.needsReview
                          ? ` · ${paymentAttempt.reviewReason ?? "Staff review required."}`
                          : ""}
                      </small>
                    ) : null}
                  </div>
                )}
              </article>
              );
            })}
          </div>
        ) : <p className="admin-empty">No student has registered yet.</p>}
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <h2>Assessments awaiting review</h2>
          <span>{assessments.length}</span>
        </div>
        {assessments.length ? (
          <div className="admin-list">
            {assessments.map((submission) => (
              <article className="admin-card admin-card-stack" key={submission.id}>
                <div>
                  <strong>{submission.student.fullName} · {submission.courseSlug.toUpperCase()}</strong>
                  <p>Section A: {submission.sectionAPoints}/40</p>
                </div>
                <div className="admin-response">{submission.writtenResponse}</div>
                <form action={gradeAssessment} className="admin-grade-form">
                  <input type="hidden" name="submissionId" value={submission.id} />
                  <label>
                    Written points (0 to 60)
                    <input name="writtenPoints" type="number" min="0" max="60" required />
                  </label>
                  <label>
                    Instructor feedback
                    <textarea name="feedback" rows={4} required minLength={3} maxLength={3000} />
                  </label>
                  <button className="btn primary" type="submit">Record grade</button>
                </form>
              </article>
            ))}
          </div>
        ) : <p className="admin-empty">No written assessment is waiting for review.</p>}
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <h2>Community moderation</h2>
          <span>{posts.length}</span>
        </div>
        <div className="admin-list">
          {posts.map((post) => (
            <article className="admin-card" key={post.id}>
              <div>
                <strong>{post.student.fullName}</strong>
                <p>{post.moduleSlug} · {post.body}</p>
              </div>
              <form action={moderateCommunityPost} className="admin-inline-form">
                <input type="hidden" name="postId" value={post.id} />
                <label>
                  Extra credits
                  <input name="engagementCredits" type="number" min="0" max="10" defaultValue={post.engagementCredits} />
                </label>
                <label className="admin-check">
                  <input name="hidden" type="checkbox" value="yes" /> Hide post
                </label>
                <button className="btn" type="submit">Save review</button>
              </form>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
