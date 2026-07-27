import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { currentStudent } from "@/lib/auth";
import { getModuleStatuses } from "@/lib/content";
import { db } from "@/lib/db";
import { getCurriculum } from "@/lib/curriculum";

export const metadata: Metadata = { title: "My studies" };

export default async function DashboardPage() {
  const student = await currentStudent();
  if (!student) redirect("/login");

  const { program } = getCurriculum();
  const enrolments = await db.getEnrolmentsForStudent(student.id);
  const progress = await db.getProgress(student.id);
  const statuses = getModuleStatuses();

  const hasAdvanced = enrolments.some((e) => e.product === "advanced");
  const entitled = new Set(
    hasAdvanced ? statuses.map((s) => s.module.slug) : enrolments.map((e) => e.product)
  );
  const pending = enrolments.filter((e) => e.status === "pending");

  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">{program.institute}</div>
        <h1>Welcome, {student.fullName.split(" ")[0]}</h1>
        <p className="deck">
          {progress.length} {progress.length === 1 ? "lesson" : "lessons"} completed.
        </p>
      </div>

      {pending.length ? (
        <div className="notice warn" style={{ maxWidth: "68ch" }}>
          <strong>Enrolment pending payment.</strong> Your place is held. Contact{" "}
          <a href={`mailto:${program.contact.email}`}>{program.contact.email}</a> to complete
          payment and unlock your courses.
        </div>
      ) : null}

      <h2>Your programme</h2>
      <div className="cards">
        {statuses.map(({ module, complete }) => {
          const unlocked = entitled.has(module.slug);
          return (
            <div className="card" key={module.slug}>
              <div className="cardtop">
                <span className="eyebrow">
                  Module {module.numeral} &middot; {module.hours} hrs
                </span>
                <span className={`avail ${complete && unlocked ? "now" : "soon"}`}>
                  {!unlocked ? "Not enrolled" : complete ? "Ready" : "In development"}
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

      <form action={signOut} style={{ marginTop: 40 }}>
        <button type="submit" className="btn">
          Sign out
        </button>
      </form>
    </main>
  );
}
