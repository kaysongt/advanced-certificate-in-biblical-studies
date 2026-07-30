import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityPage() {
  const student = await currentStudent();
  if (!student) redirect("/login?next=/community");

  const { program, modules } = getCurriculum();
  const enrollments = await db.getEnrollmentsForStudent(student.id);
  const groups = modules.filter((module) => hasActiveAccess(enrollments, module.slug));
  if (!groups.length) redirect("/enroll");

  const engagement = await db.getCommunityEngagement(student.id);

  return (
    <main className="shell">
      <div className="community-shell">
        <header className="community-index-head">
          <div>
            <div className="eyebrow">Your enrolled spaces</div>
            <h1>Community groups</h1>
            <p className="deck">
              Connect around each certificate through thoughtful, asynchronous discussion. The
              KingsWord team can respond in the same module group.
            </p>
          </div>
          <div className="engagement-tally">
            <strong>{engagement.credits}</strong>
            <span>engagement credits</span>
            <small>{engagement.posts} contributions recorded</small>
          </div>
        </header>

        <div className="community-guidance">
          {program.community.engagement}
        </div>

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
      </div>
    </main>
  );
}
