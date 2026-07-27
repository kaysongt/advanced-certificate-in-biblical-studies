import type { Metadata } from "next";
import Link from "next/link";

import { getModuleStatuses } from "@/lib/content";
import { getCurriculum } from "@/lib/curriculum";

export const metadata: Metadata = { title: "Curriculum" };

export default function CurriculumPage() {
  const { program } = getCurriculum();
  const statuses = getModuleStatuses();

  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">The programme</div>
        <h1>Curriculum</h1>
        <p className="deck">
          {program.total_certificates} certificates &middot; {program.total_courses} courses
          &middot; {program.total_hours} hours
        </p>
      </div>

      <div className="cards">
        {statuses.map(({ module, complete, coursesComplete, courses }) => (
          <Link className="card" href={`/curriculum/${module.slug}`} key={module.slug}>
            <div className="cardtop">
              <span className="eyebrow">
                Module {module.numeral} &middot; {module.hours} hrs
              </span>
              <span className={`avail ${complete ? "now" : "soon"}`}>
                {complete ? "Available now" : `${coursesComplete}/${courses} written`}
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
