import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AdminNav from "@/components/AdminNav";
import { currentStudent, isStaff } from "@/lib/auth";
import { getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";

import { reviewScholarshipApplication } from "../actions";

export const metadata: Metadata = {
  title: "Scholarship applications",
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

export default async function AdminScholarshipsPage() {
  const staff = await currentStudent();
  if (!staff || !isStaff(staff)) redirect("/");

  const scholarships = await db.listScholarshipApplications();
  const moduleNames = new Map(
    getCurriculum().modules.map((module) => [module.slug, module.short_title])
  );
  const pendingScholarships = scholarships.filter((item) => item.status === "pending").length;

  return (
    <main className="shell admin-shell">
      <header className="pagehead">
        <div className="eyebrow">KingsWord team</div>
        <h1>Staff operations</h1>
        <p className="deck">
          Review scholarship requests and activate access for approved applicants.
        </p>
      </header>

      <AdminNav pendingScholarshipCount={pendingScholarships} />

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
    </main>
  );
}
