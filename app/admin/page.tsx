import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentStudent, isStaff } from "@/lib/auth";
import { getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";

import { activateEnrollment, gradeAssessment, moderateCommunityPost } from "./actions";

export const metadata: Metadata = { title: "Staff operations" };

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

export default async function AdminPage() {
  const staff = await currentStudent();
  if (!staff || !isStaff(staff)) redirect("/");

  const [registrations, assessments, posts] = await Promise.all([
    db.listEnrollments(),
    db.listPendingAssessments(),
    db.listRecentCommunityPosts(),
  ]);
  const moduleNames = new Map(
    getCurriculum().modules.map((module) => [module.slug, module.short_title])
  );
  const registrationCounts = {
    pending: registrations.filter((item) => item.status === "pending").length,
    active: registrations.filter((item) => item.status === "active").length,
  };

  return (
    <main className="shell admin-shell">
      <header className="pagehead">
        <div className="eyebrow">KingsWord team</div>
        <h1>Staff operations</h1>
        <p className="deck">
          Review registrations, activate verified payments, grade submitted work, and moderate
          engagement.
        </p>
      </header>

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
        </div>
        {registrations.length ? (
          <div className="admin-list">
            {registrations.map((enrollment) => (
              <article className="admin-card admin-registration-card" key={enrollment.id}>
                <div className="admin-registration-person">
                  <div className="admin-registration-title">
                    <strong>{enrollment.student.fullName}</strong>
                    <span className={`registration-status ${enrollment.status}`}>
                      {enrollment.status === "pending" ? "Awaiting payment" : enrollment.status}
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
                  </dl>
                </div>
                {enrollment.status === "pending" ? (
                  <form action={activateEnrollment} className="admin-inline-form">
                    <input type="hidden" name="enrollmentId" value={enrollment.id} />
                    <label>
                      Payment or invoice reference
                      <input name="paymentReference" required minLength={3} maxLength={120} />
                    </label>
                    <button className="btn primary" type="submit">Activate access</button>
                  </form>
                ) : (
                  <div className="admin-registration-payment">
                    <span>
                      {enrollment.status === "active" ? "Access activated" : "Enrollment closed"}
                    </span>
                    <strong>{enrollment.providerRef ?? "No payment reference recorded"}</strong>
                    {enrollment.provider ? <small>Recorded via {enrollment.provider}</small> : null}
                  </div>
                )}
              </article>
            ))}
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
