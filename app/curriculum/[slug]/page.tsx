import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCourseAudio, getCourseStatuses, getModuleDoc } from "@/lib/content";
import { getModule, isModuleReleased, moduleReleaseLabel } from "@/lib/curriculum";
import { currentStudent, isStaff } from "@/lib/auth";
import { hasActiveAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { CourseBook } from "@/components/CourseBook";

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
  const actor = await currentStudent();
  const staffPreview = actor ? isStaff(actor) : false;
  const enrollments = actor && !staffPreview ? await db.getEnrollmentsForStudent(actor.id) : [];
  const canReadMaterials = staffPreview || (isModuleReleased(module) && hasActiveAccess(enrollments, module.slug));
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
    <main className="shell" id="main-content" tabIndex={-1}>
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

      {staffPreview ? (
        <div className="notice">
          <strong>Staff preview</strong> · Select any completed course below to review all its
          topics and assessment. Student release dates still apply to student accounts.
          Courses in preparation will become previewable once their content is complete.
        </div>
      ) : null}
      <h2>Courses</h2>
      <div className="stack">
        {statuses.map(({ course, available, complete }) => {
          const contents = (
            <>
              <span className="code">{course.code}</span>
              <span className="body">
                <span className="t">{course.title}</span>
                <span className="s">{course.subtitle}</span>
              </span>
              <span className="meta">
                <span className={`avail ${available ? "now" : "soon"}`}>
                  {staffPreview ? complete ? "Staff preview" : "Content in preparation" : available ? "Ready" : moduleReleaseLabel(module)}
                </span>
              </span>
            </>
          );

          return available || (staffPreview && complete) ? (
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

      <section aria-labelledby="module-materials-title" style={{ marginTop: 36 }}>
        <div className="eyebrow">Your study library</div>
        <h2 id="module-materials-title">Books &amp; audiobooks</h2>
        <p>Each book is matched to its course. Downloads open in Google Drive; if your browser previews a PDF, use its download button to save a copy.</p>
        {canReadMaterials ? module.courses.map((course) => {
          const audio = getCourseAudio(course.slug);
          return <details className="notice" key={course.slug}>
            <summary><strong>{course.code} · {course.title}</strong></summary>
            <CourseBook slug={course.slug} />
            {audio ? <p><a className="btn quiet" href={audio.folderUrl} target="_blank" rel="noopener noreferrer">Listen to audiobook ({audio.tracks.length} recordings)</a></p>
              : <p>Audiobook not yet supplied for this course.</p>}
          </details>;
        }) : <div className="notice">
          Books and recordings are available to enrolled students when this module opens. {moduleReleaseLabel(module)}.
          {!actor ? <p><Link href={`/login?next=/curriculum/${module.slug}`}>Sign in to access your materials</Link></p> : null}
        </div>}
        <p>Having trouble opening a file? Contact <a href="mailto:kti@kingsword.org">kti@kingsword.org</a> with the course code.</p>
      </section>

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

      <h2>Module guide</h2>
      <p className="deck" style={{ maxWidth: "62ch" }}>
        Learning outcomes, reading requirements, and assessment guidance for this certificate.
      </p>

      {doc.ready ? <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} /> : (
        <div className="notice">The detailed study guide is being prepared by the Institute. {moduleReleaseLabel(module)}. Course materials will appear here when they are ready.</div>
      )}

      {!staffPreview ? <div style={{ marginTop: 36 }}>
        <Link
          href={moduleAvailable ? "/enroll?plan=certificate" : "/enroll?plan=advanced"}
          className="btn primary lg"
        >
          {moduleAvailable ? "Enroll in this certificate" : "Reserve the full program"}
        </Link>
      </div> : null}
    </main>
  );
}
