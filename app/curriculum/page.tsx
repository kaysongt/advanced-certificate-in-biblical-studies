import type { Metadata } from "next";
import Link from "next/link";

import { getModuleStatuses } from "@/lib/content";
import { currentStudent, isStaff } from "@/lib/auth";
import { getCurriculum, moduleReleaseLabel } from "@/lib/curriculum";

export const metadata: Metadata = { title: "Curriculum" };
export const dynamic = "force-dynamic";

export default async function CurriculumPage() {
  const actor = await currentStudent();
  const staffPreview = actor ? isStaff(actor) : false;
  const { program } = getCurriculum();
  const statuses = getModuleStatuses();

  return (
    <main className="shell" id="main-content" tabIndex={-1}>
      <div className="pagehead">
        <div className="eyebrow">The program</div>
        <h1>Curriculum</h1>
        <p className="deck">
          {program.total_certificates} certificates &middot; {program.total_courses} courses
          &middot; {program.total_hours} hours
        </p>
      </div>

      {staffPreview ? (
        <div className="notice">
          <strong>Staff preview access</strong> · Open a module below to review its completed
          courses, topics, videos, and assessments before release. No payment is needed for
          staff preview, and student release dates and progress are unchanged.
        </div>
      ) : null}

      <div className="cards">
        {statuses.map(({ module, available, coursesComplete }) => (
          <Link className="card" href={`/curriculum/${module.slug}`} key={module.slug}>
            <div className="cardtop">
              <span className="eyebrow">
                Module {module.numeral} &middot; {module.hours} hrs
              </span>
              <span className={`avail ${available || (staffPreview && coursesComplete > 0) ? "now" : "soon"}`}>
                {staffPreview ? coursesComplete > 0 ? "Staff preview" : "Content in preparation" : available ? "Available now" : moduleReleaseLabel(module)}
              </span>
            </div>
            <span className="t">{module.short_title}</span>
            <p>{module.catalog_blurb}</p>
            <span className="foot">
              {module.courses.length} courses &middot; {module.series}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
