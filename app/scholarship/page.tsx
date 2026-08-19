import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { currentStudent } from "@/lib/auth";
import { getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";

import ScholarshipForm from "./ScholarshipForm";

export const metadata: Metadata = {
  title: "Scholarship application",
};

const submittedDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function tuition(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function ScholarshipPage({
  searchParams,
}: {
  searchParams: Promise<{ enrollment?: string }>;
}) {
  const student = await currentStudent();
  if (!student) {
    return (
      <main className="shell scholarship-shell">
        <section className="scholarship-intro scholarship-prospect-intro">
          <div>
            <div className="eyebrow">Access to biblical training</div>
            <h1>Apply for a KTI scholarship</h1>
            <p className="deck">
              If tuition would keep you from enrolling, you can ask the KingsWord team to consider
              you for a full tuition scholarship.
            </p>
            <div className="scholarship-prospect-actions">
              <Link className="btn primary lg" href="/enroll?scholarship=apply">
                Start a scholarship application
              </Link>
              <Link className="btn quiet lg" href="/login?next=%2Fscholarship">
                Sign in to continue an application
              </Link>
            </div>
          </div>
          <aside className="scholarship-prospect-steps" aria-label="How scholarship applications work">
            <span>How it works</span>
            <ol>
              <li>Create your student account and choose the program or certificate you want.</li>
              <li>Tell us about your financial need and how you plan to use the training.</li>
              <li>Authorized KTI staff review your request privately and record a decision.</li>
            </ol>
            <p>Applying does not require payment and does not guarantee an award.</p>
          </aside>
        </section>
      </main>
    );
  }

  const { enrollment: requestedEnrollmentId } = await searchParams;
  const enrollments = await db.getEnrollmentsForStudent(student.id);
  const enrollment = requestedEnrollmentId
    ? enrollments.find((item) => item.id === requestedEnrollmentId)
    : enrollments.find((item) => item.status === "pending");
  if (!enrollment) redirect("/dashboard");

  const application = await db.getScholarshipApplicationForEnrollment(
    enrollment.id,
    student.id
  );
  if (!application && enrollment.status !== "pending") redirect("/dashboard");

  const moduleNames = new Map(
    getCurriculum().modules.map((module) => [module.slug, module.short_title])
  );
  const programName =
    enrollment.product === "advanced"
      ? "Advanced Certificate in Biblical Studies"
      : moduleNames.get(enrollment.product) ?? enrollment.product;

  return (
    <main className="shell scholarship-shell">
      <section className="scholarship-intro">
        <div>
          <div className="eyebrow">Access to biblical training</div>
          <h1>Scholarship application</h1>
          <p className="deck">
            Financial hardship should not prevent a committed student from being considered.
            Tell the KingsWord team about your circumstances and how you hope to use the training.
          </p>
        </div>
        <aside className="scholarship-enrollment-summary" aria-label="Selected enrollment">
          <span>Application for</span>
          <strong>{programName}</strong>
          <dl>
            <div>
              <dt>Published tuition</dt>
              <dd>{tuition(enrollment.amount, enrollment.currency)}</dd>
            </div>
            <div>
              <dt>Student</dt>
              <dd>{student.fullName}</dd>
            </div>
          </dl>
        </aside>
      </section>

      {application ? (
        <section className={`scholarship-status-card ${application.status}`}>
          <div className="eyebrow">Application status</div>
          <h2>
            {application.status === "pending"
              ? "Your application is under review"
              : application.status === "approved"
                ? "Your scholarship was approved"
                : "Your application has been reviewed"}
          </h2>
          <p>
            {application.status === "pending"
              ? "The KingsWord team can now view your application in the staff dashboard. You do not need to submit it again."
              : application.status === "approved"
                ? "Your enrollment has been activated. You can begin studying as soon as the module reaches its published opening date."
                : "A scholarship was not awarded for this enrollment. Your card and bank-transfer payment options remain available."}
          </p>
          <div className="scholarship-status-meta">
            Submitted {submittedDate.format(new Date(application.createdAt))}
          </div>
          <Link className="btn primary lg" href="/dashboard">
            Return to my studies
          </Link>
        </section>
      ) : (
        <section className="scholarship-application-card">
          <div className="scholarship-form-head">
            <span>One application per enrollment</span>
            <h2>Tell us about your need and your calling.</h2>
            <p>
              Applications are reviewed privately by authorized KingsWord staff. An approved
              application provides a full tuition scholarship for this enrollment.
            </p>
          </div>
          <ScholarshipForm enrollmentId={enrollment.id} tuition={enrollment.amount} />
        </section>
      )}
    </main>
  );
}
