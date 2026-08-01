import type { Metadata } from "next";
import Link from "next/link";

import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityPage() {
  const student = await currentStudent();
  const { program, modules } = getCurriculum();
  const enrollments = student ? await db.getEnrollmentsForStudent(student.id) : [];
  const groups = student
    ? modules.filter((module) => hasActiveAccess(enrollments, module.slug))
    : [];
  const engagement = student
    ? await db.getCommunityEngagement(student.id)
    : { posts: 0, credits: 0 };

  return (
    <main className="shell">
      <div className="community-shell">
        <header className="community-index-head">
          <div>
            <div className="eyebrow">
              {groups.length ? "Your enrolled spaces" : "Learning in community"}
            </div>
            <h1>Community groups</h1>
            <p className="deck">
              Connect around each certificate through thoughtful, asynchronous discussion. The
              KingsWord team can respond in the same module group.
            </p>
          </div>
          {student ? (
            <div className="engagement-tally">
              <strong>{engagement.credits}</strong>
              <span>engagement credits</span>
              <small>{engagement.posts} contributions recorded</small>
            </div>
          ) : null}
        </header>

        <div className="community-guidance">
          {program.community.access} {program.community.engagement}
        </div>

        {groups.length ? (
          <div className="community-group-grid">
            {groups.map((module) => (
              <Link className="community-group-card" href={`/community/${module.slug}`} key={module.slug}>
                <span>Module {module.numeral}</span>
                <h2>{module.short_title}</h2>
                <p>{module.catalog_blurb}</p>
                <strong>Open discussion <span aria-hidden="true">&rarr;</span></strong>
              </Link>
            ))}
          </div>
        ) : (
          <div className="community-empty community-index-empty">
            <strong>{student ? "No active community groups yet." : "Your community starts here."}</strong>
            <p>
              {student
                ? "Your certificate community appears here as soon as enrollment access is activated."
                : "Sign in to open your enrolled groups, or explore the curriculum before choosing a certificate."}
            </p>
            <div className="community-empty-actions">
              {student ? (
                <Link className="btn primary" href="/dashboard">My studies</Link>
              ) : (
                <Link className="btn primary" href="/login?next=/community">Sign in</Link>
              )}
              <Link className="btn" href="/curriculum">Explore curriculum</Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
