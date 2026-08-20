import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AdminNav from "@/components/AdminNav";
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
  resetStudentPassword,
  setStudentRole,
} from "./actions";

export const metadata: Metadata = {
  title: "Staff operations",
  robots: { index: false, follow: false },
};

const roleMessages: Record<string, { tone: "good" | "warn" | "bad"; text: string }> = {
  done: { tone: "good", text: "Access level updated. It applies the next time they load a page." },
  self: {
    tone: "warn",
    text: "You cannot change your own access level. Ask the other administrator to do it.",
  },
  last: {
    tone: "bad",
    text: "That is the last administrator. Promote someone else first, or nobody can reach this page.",
  },
  nochange: { tone: "warn", text: "That account already has this access level." },
  missing: { tone: "bad", text: "That account no longer exists." },
  invalid: { tone: "bad", text: "Choose one of student, staff, or administrator." },
};

const resetMessages: Record<string, { tone: "good" | "warn" | "bad"; text: string }> = {
  done: {
    tone: "good",
    text: "Password updated. Pass it to the student directly — nothing was emailed.",
  },
  invalid: { tone: "bad", text: "A new password needs at least 10 characters." },
  missing: { tone: "bad", text: "That account no longer exists." },
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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; role?: string }>;
}) {
  const staff = await currentStudent();
  if (!staff || !isStaff(staff)) redirect("/");

  const isAdministrator = staff.role === "admin";
  const { reset, role } = await searchParams;
  const resetMessage = reset ? resetMessages[reset] : null;
  const roleMessage = role ? roleMessages[role] : null;

  const [registrations, pendingScholarships, assessments, posts, team, students] =
    await Promise.all([
    db.listEnrollments(),
    db.countPendingScholarshipApplications(),
    db.listPendingAssessments(),
    db.listRecentCommunityPosts(),
    db.listStaff(),
    db.listStudents(),
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

  // Money, which the card list alone never added up. It matters more now that a
  // promotion code can clear a whole tuition: "active" no longer implies "paid",
  // so collected, discounted, and outstanding are tracked apart.
  const money = registrations.reduce(
    (totals, enrollment) => {
      const attempt = paymentAttempts.get(enrollment.id);
      const listMinor = enrollment.amount * 100;
      const discountMinor = attempt?.discountAmountMinor ?? 0;
      if (enrollment.status === "active") {
        totals.collectedMinor += Math.max(0, listMinor - discountMinor);
        totals.discountedMinor += discountMinor;
        if (discountMinor >= listMinor) totals.freeSeats += 1;
      } else if (enrollment.status === "pending") {
        totals.outstandingMinor += listMinor;
      }
      return totals;
    },
    { collectedMinor: 0, discountedMinor: 0, outstandingMinor: 0, freeSeats: 0 }
  );

  // Which codes are actually being used, and how many times.
  const promotionUse = new Map<string, number>();
  for (const enrollment of registrations) {
    const code = paymentAttempts.get(enrollment.id)?.promotionCode;
    if (code) promotionUse.set(code, (promotionUse.get(code) ?? 0) + 1);
  }
  const promotionRows = [...promotionUse.entries()].sort((a, b) => b[1] - a[1]);


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

      <AdminNav pendingScholarshipCount={pendingScholarships} />

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <h2>Student registrations</h2>
            <p>Everyone who has registered through the website, newest first.</p>
          </div>
          <span>{registrations.length}</span>
        </div>
        <div className="admin-money-summary" aria-label="Tuition totals">
          <div>
            <dt>Collected</dt>
            <dd>{tuition(money.collectedMinor / 100, "USD")}</dd>
            <small>Activated enrolments, after any discount</small>
          </div>
          <div>
            <dt>Given as discount</dt>
            <dd>{tuition(money.discountedMinor / 100, "USD")}</dd>
            <small>
              {money.freeSeats} {money.freeSeats === 1 ? "seat" : "seats"} fully free
            </small>
          </div>
          <div>
            <dt>Outstanding</dt>
            <dd>{tuition(money.outstandingMinor / 100, "USD")}</dd>
            <small>Reserved but not yet paid</small>
          </div>
        </div>
        {promotionRows.length ? (
          <div className="admin-promo-usage" aria-label="Promotion code use">
            <span className="admin-promo-label">Codes redeemed</span>
            {promotionRows.map(([code, count]) => (
              <span className="admin-promo-chip" key={code}>
                <strong>{code}</strong> &times;{count}
              </span>
            ))}
          </div>
        ) : null}
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
                    {paymentAttempt?.discountAmountMinor ? (
                      <div>
                        <dt>Promotion</dt>
                        <dd>
                          &minus;{tuition(paymentAttempt.discountAmountMinor / 100, enrollment.currency)}
                          {paymentAttempt.promotionCode ? ` · ${paymentAttempt.promotionCode}` : ""}
                        </dd>
                      </div>
                    ) : null}
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

      {/*
        * Who can reach this page at all. Read from the student table rather
        * than from enrolments, because an administrator created by
        * `npm run admin:create` never enrols and would otherwise be invisible
        * on the one screen meant to show who holds access.
        */}
      <section className="admin-section" id="students" style={{ scrollMarginTop: 90 }}>
        <div className="admin-section-head">
          <div>
            <h2>Everyone enrolled</h2>
            <p>
              Every account on the course. Setting a password here replaces the old one
              immediately — hand the new one to the student yourself.
            </p>
          </div>
          <span>{students.length}</span>
        </div>

        {resetMessage ? (
          <div className={`notice ${resetMessage.tone}`} role="status">
            {resetMessage.text}
          </div>
        ) : null}

        {roleMessage ? (
          <div className={`notice ${roleMessage.tone}`} role="status">
            {roleMessage.text}
          </div>
        ) : null}

        {students.length ? (
          <div className="admin-student-list">
            {students.map((person) => (
              <article className="admin-student-row" key={person.id}>
                <div className="admin-student-identity">
                  <strong>{person.fullName}</strong>
                  <a href={`mailto:${person.email}`}>{person.email}</a>
                  <span className="admin-student-meta">
                    Joined {registrationDate.format(new Date(person.createdAt))}
                  </span>
                </div>
                {isAdministrator && person.id !== staff.id ? (
                  <form action={setStudentRole} className="admin-role-form">
                    <input type="hidden" name="studentId" value={person.id} />
                    <label className="sr-only" htmlFor={`role-${person.id}`}>
                      Access level for {person.fullName}
                    </label>
                    <select id={`role-${person.id}`} name="role" defaultValue={person.role}>
                      <option value="student">Student</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Administrator</option>
                    </select>
                    <button type="submit" className="btn quiet sm">
                      Save
                    </button>
                  </form>
                ) : (
                  <span className={`admin-role-badge ${person.role}`}>
                    {person.id === staff.id ? "you" : person.role}
                  </span>
                )}
                {isAdministrator ? (
                  <form action={resetStudentPassword} className="admin-reset-form">
                    <input type="hidden" name="studentId" value={person.id} />
                    <label className="sr-only" htmlFor={`pw-${person.id}`}>
                      New password for {person.fullName}
                    </label>
                    <input
                      id={`pw-${person.id}`}
                      name="newPassword"
                      type="text"
                      placeholder="New password (10+ characters)"
                      minLength={10}
                      maxLength={200}
                      autoComplete="off"
                      required
                    />
                    <button type="submit" className="btn quiet sm">
                      Reset
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-empty">No accounts yet.</p>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <h2>Team access</h2>
            <p>Accounts that can open this page. Set access levels in the roster above.</p>
          </div>
          <span>{team.length}</span>
        </div>
        {team.length ? (
          <div className="admin-team-list">
            {team.map((member) => (
              <article className="admin-team-member" key={member.id}>
                <div>
                  <strong>{member.fullName}</strong>
                  <a href={`mailto:${member.email}`}>{member.email}</a>
                </div>
                <span className={`admin-role-badge ${member.role}`}>{member.role}</span>
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-empty">No staff or administrator account exists yet.</p>
        )}
      </section>
    </main>
  );
}
