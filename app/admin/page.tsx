import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentStudent, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";

import { activateEnrollment, gradeAssessment, moderateCommunityPost } from "./actions";

export const metadata: Metadata = { title: "Staff operations" };

export default async function AdminPage() {
  const staff = await currentStudent();
  if (!staff || !isStaff(staff)) redirect("/");

  const [enrollments, assessments, posts] = await Promise.all([
    db.listPendingEnrollments(),
    db.listPendingAssessments(),
    db.listRecentCommunityPosts(),
  ]);

  return (
    <main className="shell admin-shell">
      <header className="pagehead">
        <div className="eyebrow">KingsWord team</div>
        <h1>Staff operations</h1>
        <p className="deck">Activate verified payments, grade submitted work, and moderate engagement.</p>
      </header>

      <section className="admin-section">
        <div className="admin-section-head">
          <h2>Pending enrollments</h2>
          <span>{enrollments.length}</span>
        </div>
        {enrollments.length ? (
          <div className="admin-list">
            {enrollments.map((enrollment) => (
              <article className="admin-card" key={enrollment.id}>
                <div>
                  <strong>{enrollment.student.fullName}</strong>
                  <p>{enrollment.student.email} · {enrollment.product} · {enrollment.currency} {enrollment.amount}</p>
                </div>
                <form action={activateEnrollment} className="admin-inline-form">
                  <input type="hidden" name="enrollmentId" value={enrollment.id} />
                  <label>
                    Payment or invoice reference
                    <input name="paymentReference" required minLength={3} maxLength={120} />
                  </label>
                  <button className="btn primary" type="submit">Activate access</button>
                </form>
              </article>
            ))}
          </div>
        ) : <p className="admin-empty">No enrollment is waiting for activation.</p>}
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
