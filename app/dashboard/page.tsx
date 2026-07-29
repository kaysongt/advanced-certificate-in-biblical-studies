import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { getModuleStatuses } from "@/lib/content";
import { db } from "@/lib/db";
import { getCurriculum } from "@/lib/curriculum";

export const metadata: Metadata = { title: "My studies" };

export default async function DashboardPage() {
  const student = await currentStudent();
  if (!student) redirect("/login");

  const { program, grading } = getCurriculum();
  const enrollments = await db.getEnrollmentsForStudent(student.id);
  const progress = await db.getProgress(student.id);
  const statuses = getModuleStatuses();

  const pending = enrollments.filter((e) => e.status === "pending");

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
        <div className="notice warn" style={{ maxWidth: "68ch" }}>
          <strong>Enrollment pending payment.</strong> Your place is held. Contact{" "}
          <a href={`mailto:${program.contact.email}`}>{program.contact.email}</a> to complete
          payment and unlock your courses.
        </div>
      ) : null}

      <h2>Your program</h2>
      <div className="cards five">
        {statuses.map(({ module, complete }) => {
          const unlocked = hasActiveAccess(enrollments, module.slug);
          return (
            <div className="card" key={module.slug}>
              <div className="cardtop">
                <span className="eyebrow">
                  Module {module.numeral} &middot; {module.hours} hrs
                </span>
                <span className={`avail ${complete && unlocked ? "now" : "soon"}`}>
                  {!unlocked
                    ? "Not enrolled"
                    : complete
                      ? "Ready"
                      : module.availability ?? "Coming soon"}
                </span>
              </div>
              <span className="t">{module.short_title}</span>
              <p>{module.catalog_blurb}</p>
              <span className="foot">
                {unlocked && complete ? (
                  <Link href={`/curriculum/${module.slug}`}>Start studying →</Link>
                ) : !unlocked ? (
                  <Link href="/enroll">Add this certificate →</Link>
                ) : (
                  "Releasing soon"
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

      <form action={signOut} style={{ marginTop: 44 }}>
        <button type="submit" className="btn">
          Sign out
        </button>
      </form>
    </main>
  );
}
