import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCourseStatuses, getModuleDoc } from "@/lib/content";
import { getModule, moduleReleaseLabel } from "@/lib/curriculum";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

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
  const moduleAvailable = statuses.length > 0 && statuses.every((status) => status.available);
  const lessons = module.courses.length * module.lessons_per_course;
  const videoBriefings = [
    {
      label: "Opening video",
      title: module.opening_video?.title ?? `Welcome to ${module.short_title}`,
      description: "An orientation from the Institute to frame your study before the first course.",
      video: module.opening_video,
    },
    {
      label: "Closing video",
      title: module.closing_video?.title ?? module.video?.title ?? `Completing ${module.short_title}`,
      description: "A closing reflection and next-step charge after you have completed the module.",
      video: module.closing_video ?? module.video,
    },
  ];

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
          <span className="tag">
            {module.lessons_per_course} Topics per course &middot; {lessons} total
          </span>
        </div>
      </div>

      <h2>Courses</h2>
      <div className="stack">
        {statuses.map(({ course, available }) => {
          const contents = (
            <>
              <span className="code">{course.code}</span>
              <span className="body">
                <span className="t">{course.title}</span>
                <span className="s">{course.subtitle}</span>
              </span>
              <span className="meta">
                <span className={`avail ${available ? "now" : "soon"}`}>
                  {available ? "Ready" : moduleReleaseLabel(module)}
                </span>
              </span>
            </>
          );

          return available ? (
            <Link className="row" href={`/courses/${course.slug}`} key={course.slug}>
              {contents}
            </Link>
          ) : (
            <div className="row is-locked" key={course.slug}>
              {contents}
            </div>
          );
        })}
      </div>

      <section className="module-community">
        <div>
          <div className="eyebrow">Enrolled student space</div>
          <h2>Continue the conversation in the module community.</h2>
          <p>
            Share questions, feedback, and reflections with fellow students and the KingsWord team.
            Participation is asynchronous, attached to this module, and available after enrollment.
          </p>
        </div>
        <Link href={`/community/${module.slug}`} className="btn quiet lg">
          Open the community group
        </Link>
      </section>

      <section className="module-briefings">
        <div className="module-briefings-head">
          <div>
            <div className="eyebrow">Video briefings</div>
            <h2>Start and finish with a clear word.</h2>
          </div>
          <p>
            These short videos replace live chat sessions and are posted by the Institute for
            enrolled students at the beginning and conclusion of each module.
          </p>
        </div>
        <div className="video-briefing-grid">
          {videoBriefings.map((briefing) => (
            <article className="video-briefing" key={briefing.label}>
              <span>{briefing.label}</span>
              <h3>{briefing.title}</h3>
              <p>{briefing.description}</p>
              {briefing.video?.url ? (
                <div className="frame">
                  <iframe
                    src={briefing.video.url}
                    title={briefing.video.title ?? briefing.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <small>Video briefing posts here when it is released by the Institute.</small>
              )}
            </article>
          ))}
        </div>
      </section>

      <h2>Module assignment</h2>
      <p className="deck" style={{ maxWidth: "62ch" }}>
        One assignment for the whole module, submitted after all {module.courses.length}{" "}
        courses are complete.
      </p>

      <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />

      <div style={{ marginTop: 36 }}>
        <Link
          href={moduleAvailable ? "/enroll?plan=certificate" : "/enroll?plan=advanced"}
          className="btn primary lg"
        >
          {moduleAvailable ? "Enroll in this certificate" : "Reserve the full program"}
        </Link>
      </div>
    </main>
  );
}
