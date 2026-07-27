import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { currentStudent } from "@/lib/auth";
import { getCourseDoc, getLessonRows } from "@/lib/content";
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

  const student = await currentStudent();
  if (!student) redirect(`/login?next=/courses/${slug}`);

  const enrolments = await db.getEnrolmentsForStudent(student.id);
  const entitled = enrolments.some(
    (e) => e.product === "advanced" || e.product === module.slug
  );
  if (!entitled) redirect("/enroll");

  const { grading } = getCurriculum();
  const rows = getLessonRows(module, course);
  const doc = getCourseDoc(module, course);
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

        <div className={`row${allDone ? "" : " is-locked"}`}>
          <span className="code">&mdash;</span>
          <span className="body">
            <span className="t">Course Assessment</span>
            <span className="s">
              Taken after all {rows.length} topics. Pass mark {grading.pass_mark}%.
            </span>
          </span>
          <span className="meta">{allDone ? "Ready" : "Locked"}</span>
        </div>
      </div>

      {doc.html ? <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} /> : null}
    </main>
  );
}
