import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import TopicReader from "@/components/TopicReader";
import { entitlementRedirectPath, hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { getCourseStatuses, getLesson, getLessonRows } from "@/lib/content";
import { findCourse, getCurriculum, lessonId } from "@/lib/curriculum";
import { db } from "@/lib/db";

type Props = { params: Promise<{ slug: string; n: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, n } = await params;
  const found = findCourse(slug);
  if (!found) return {};
  const rows = getLessonRows(found.module, found.course);
  const row = rows.find((r) => r.n === Number(n));
  return { title: row ? `${found.course.code} · ${row.title}` : found.course.title };
}

export default async function TopicPage({ params }: Props) {
  const { slug, n } = await params;
  const index = Number(n);

  const found = findCourse(slug);
  if (!found || !Number.isInteger(index)) notFound();
  const { module, course } = found;

  const available = getCourseStatuses().some(
    (status) => status.course.slug === course.slug && status.available
  );
  if (!available) redirect(`/curriculum/${module.slug}`);

  const rows = getLessonRows(module, course);
  const row = rows.find((r) => r.n === index);
  if (!row) notFound();

  // Study material is for enrolled students only.
  const student = await currentStudent();
  if (!student) redirect(`/login?next=/courses/${slug}/${index}`);

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  const entitled = hasActiveAccess(enrollments, module.slug);
  if (!entitled) redirect(entitlementRedirectPath(enrollments));

  const { grading } = getCurriculum();
  const lesson = getLesson(module, course, index);
  const progress = await db.getProgress(student.id);
  const done = new Set(progress.map((p) => p.lessonId));

  const prevRow = rows.find((r) => r.n === index - 1) ?? null;
  const nextRow = rows.find((r) => r.n === index + 1) ?? null;

  // Sequential gating: you may not skip ahead past an unfinished topic.
  if (grading.must_pass_to_advance && prevRow && !done.has(prevRow.id)) {
    redirect(`/courses/${slug}/${prevRow.n}`);
  }

  const hasQuiz = lesson.html.includes('class="quiz"');
  const chapter = row.reading;

  return (
    <main className="shell">
      <div className="topicwrap">
      <div className="breadcrumb">
        <Link href={`/curriculum/${module.slug}`}>{module.short_title}</Link>
        <span className="sep">/</span>
        <Link href={`/courses/${course.slug}`}>{course.code}</Link>
        <span className="sep">/</span>
        Topic {index}
      </div>

      <div className="topicbar">
        {rows.map((r) => {
          const isDone = done.has(r.id);
          const locked =
            grading.must_pass_to_advance && r.n > 1 && !done.has(rows[r.n - 2].id);
          if (r.n === index) {
            return (
              <span className="cur" key={r.id}>
                {r.n}
              </span>
            );
          }
          return locked ? (
            <span className="lock" key={r.id} title="Complete the previous topic first">
              {r.n}
            </span>
          ) : (
            <Link href={`/courses/${course.slug}/${r.n}`} className={isDone ? "done" : ""} key={r.id}>
              {r.n}
            </Link>
          );
        })}
      </div>

      <header className="topichead">
        <h1>{row.title}</h1>
        <div className="pillrow">
          <span className="pill">
            Topic {index} of {rows.length}
          </span>
          {chapter ? <span className="pill chapter">{chapter}</span> : null}
          <span className="pill quiet">{row.duration}</span>
        </div>
      </header>

      <TopicReader
        html={lesson.html}
        courseSlug={course.slug}
        lessonId={lessonId(course.slug, index)}
        passMark={grading.pass_mark}
        mustPass={grading.must_pass_to_advance}
        alreadyComplete={done.has(row.id)}
        hasQuiz={hasQuiz}
        path={`/courses/${slug}/${index}`}
        prev={prevRow ? { href: `/courses/${slug}/${prevRow.n}`, title: prevRow.title } : null}
        next={
          nextRow
            ? { href: `/courses/${slug}/${nextRow.n}`, title: nextRow.title }
            : { href: `/courses/${slug}/assessment`, title: "Course assessment" }
        }
      />
      </div>
    </main>
  );
}
