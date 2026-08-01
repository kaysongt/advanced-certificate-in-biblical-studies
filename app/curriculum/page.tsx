import type { Metadata } from "next";
import Link from "next/link";

import { getModuleStatuses } from "@/lib/content";
import { getCurriculum, moduleReleaseLabel } from "@/lib/curriculum";

export const metadata: Metadata = { title: "Curriculum" };
export const dynamic = "force-dynamic";

export default function CurriculumPage() {
  const { program } = getCurriculum();
  const statuses = getModuleStatuses();

  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">The program</div>
        <h1>Curriculum</h1>
        <p className="deck">
          {program.total_certificates} certificates &middot; {program.total_courses} courses
          &middot; {program.total_hours} hours
        </p>
      </div>

      <div className="cards">
        {statuses.map(({ module, available }) => (
          <Link className="card" href={`/curriculum/${module.slug}`} key={module.slug}>
            <div className="cardtop">
              <span className="eyebrow">
                Module {module.numeral} &middot; {module.hours} hrs
              </span>
              <span className={`avail ${available ? "now" : "soon"}`}>
                {available ? "Available now" : moduleReleaseLabel(module)}
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
