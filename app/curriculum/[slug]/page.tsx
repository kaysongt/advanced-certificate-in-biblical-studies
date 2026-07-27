import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCourseStatuses, getModuleDoc } from "@/lib/content";
import { getCurriculum, getModule } from "@/lib/curriculum";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getCurriculum().modules.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const module = getModule(slug);
  if (!module) return {};
  return { title: module.title, description: module.catalog_blurb };
}

export default async function ModulePage({ params }: Props) {
  const { slug } = await params;
  const module = getModule(slug);
  if (!module) notFound();

  const doc = getModuleDoc(module);
  const statuses = getCourseStatuses().filter((s) => s.module.slug === module.slug);
  const lessons = module.courses.length * module.lessons_per_course;

  return (
    <main className="shell">
      <div className="breadcrumb">
        <Link href="/curriculum">Curriculum</Link>
        <span className="sep">/</span>
        {module.short_title}
      </div>

      <div className="pagehead">
        <div className="eyebrow">
          Module {module.numeral} &middot; {module.series}
        </div>
        <h1>{module.title}</h1>
        <p className="deck">{module.catalog_blurb}</p>
        <div className="facts">
          <span className="tag">{module.hours} Hours</span>
          <span className="tag">{module.courses.length} Courses</span>
          <span className="tag">{lessons} Lessons</span>
        </div>
      </div>

      <h2>Courses</h2>
      <div className="stack">
        {statuses.map(({ course, complete }) => (
          <div className="row" key={course.slug}>
            <span className="code">{course.code}</span>
            <span className="body">
              <span className="t">{course.title}</span>
              <span className="s">{course.subtitle}</span>
            </span>
            <span className="meta">
              <span className={`avail ${complete ? "now" : "soon"}`}>
                {complete ? "Ready" : "Writing"}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />

      <div style={{ marginTop: 36 }}>
        <Link href="/enroll?plan=certificate" className="btn primary lg">
          Enrol in this certificate
        </Link>
      </div>
    </main>
  );
}
