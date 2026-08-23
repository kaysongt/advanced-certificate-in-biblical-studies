import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { currentStudent } from "@/lib/auth";
import { entitlementRedirectPath, hasActiveAccess } from "@/lib/access";
import { getCourseAudio, getCourseDoc, getCourseStatuses, getLessonRows } from "@/lib/content";
import { findCourse, getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = findCourse(slug);
  return found ? { title: `${found.course.code} ${found.course.title}` } : {};
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const found = findCourse(slug);
  if (!found) notFound();
  const { module, course } = found;

  const available = getCourseStatuses().some(
    (status) => status.course.slug === course.slug && status.available
  );
  if (!available) redirect(`/curriculum/${module.slug}`);

  const student = await currentStudent();
  if (!student) redirect(`/login?next=/courses/${slug}`);

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  const entitled = hasActiveAccess(enrollments, module.slug);
  if (!entitled) redirect(entitlementRedirectPath(enrollments));

  const { grading } = getCurriculum();
  const rows = getLessonRows(module, course);
  const doc = getCourseDoc(module, course);
  const audio = getCourseAudio(course.slug);
  const progress = await db.getProgress(student.id);
  const done = new Set(progress.map((p) => p.lessonId));
  const completed = rows.filter((r) => done.has(r.id)).length;
  const allDone = completed === rows.length;

  return (
    <main className="shell">
      <div className="breadcrumb">
        <Link href={`/curriculum/${module.slug}`}>{module.short_title}</Link>
        <span className="sep">/</span>
        {course.code}
      </div>

      <header className="topichead">
        <h1>{course.title}</h1>
        <p className="deck">{course.subtitle}</p>
        <div className="pillrow">
          <span className="pill">{course.code}</span>
          <span className="pill quiet">{module.hours_per_course} hours</span>
          <span className="pill quiet">{rows.length} topics</span>
          <span className={`pill ${allDone ? "ok" : "quiet"}`}>
            {completed} of {rows.length} complete
          </span>
        </div>
      </header>

      {course.textbook ? (
        <div className="notice">
          <strong>Course material:</strong> {course.textbook}
        </div>
      ) : null}

      {/*
        * These clips arrive in portrait, square, and landscape, so the frame
        * sizes itself from each file's own dimensions rather than forcing one
        * shape. width/height on the element reserve the right box up front,
        * which keeps the page from jumping once the video loads.
        */}
      {course.intro_video?.url ? (
        <section className="course-intro" aria-labelledby="course-intro-title">
          <div className="eyebrow">Start here</div>
          <h2 id="course-intro-title">
            {course.intro_video.title ?? `Introducing ${course.title}`}
          </h2>
          <div className="course-intro-frame">
            <video
              src={course.intro_video.url}
              poster={course.intro_video.poster ?? undefined}
              width={course.intro_video.width ?? undefined}
              height={course.intro_video.height ?? undefined}
              controls
              playsInline
              preload="metadata"
              aria-label={course.intro_video.title ?? `Introducing ${course.title}`}
            />
          </div>
          {course.intro_video.duration ? (
            <p className="course-intro-meta">{course.intro_video.duration}</p>
          ) : null}
        </section>
      ) : null}

      {audio ? (
        <section className="audio-library" aria-labelledby="audio-library-title">
          <div>
            <div className="eyebrow">Included audiobook</div>
            <h2 id="audio-library-title">Listen chapter by chapter</h2>
            <p>
              Use these recordings alongside the written topics. They open from the supplied
              course library in Google Drive.
            </p>
          </div>
          <details>
            <summary>
              {audio.title} <span>{audio.tracks.length} recordings</span>
            </summary>
            <ol>
              {audio.tracks.map((track) => (
                <li key={track.url}>
                  <a href={track.url} target="_blank" rel="noreferrer">
                    {track.title}
                  </a>
                </li>
              ))}
            </ol>
            <a className="folder-link" href={audio.folderUrl} target="_blank" rel="noreferrer">
              Open the complete audio folder
            </a>
          </details>
        </section>
      ) : null}

      <h2>Topics</h2>
      <div className="stack">
        {rows.map((r, i) => {
          const isDone = done.has(r.id);
          const locked = grading.must_pass_to_advance && i > 0 && !done.has(rows[i - 1].id);
          const body = (
            <>
              <span className="code">{String(r.n).padStart(2, "0")}</span>
              <span className="body">
                <span className="t">{r.title}</span>
                {r.reading ? <span className="pill chapter sm">{r.reading}</span> : null}
              </span>
              <span className="meta">
                {isDone ? <span className="pill ok">Done</span> : locked ? "Locked" : r.duration}
              </span>
            </>
          );
          return locked ? (
            <div className="row is-locked" key={r.id}>
              {body}
            </div>
          ) : (
            <Link className="row" href={`/courses/${course.slug}/${r.n}`} key={r.id}>
              {body}
            </Link>
          );
        })}

        {allDone ? <Link className="row" href={`/courses/${course.slug}/assessment`}>
          <span className="code">&mdash;</span>
          <span className="body">
            <span className="t">Course Assessment</span>
            <span className="s">
              Taken after all {rows.length} topics. Pass mark {grading.pass_mark}%.
            </span>
          </span>
          <span className="meta">Ready</span>
        </Link> : <div className="row is-locked">
          <span className="code">&mdash;</span>
          <span className="body">
            <span className="t">Course Assessment</span>
            <span className="s">
              Taken after all {rows.length} topics. Pass mark {grading.pass_mark}%.
            </span>
          </span>
          <span className="meta">Locked</span>
        </div>}
      </div>

      {doc.html ? <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} /> : null}
    </main>
  );
}
