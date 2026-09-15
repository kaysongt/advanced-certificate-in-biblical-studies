import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { randomInt } from "node:crypto";

import AssessmentQuiz from "@/components/AssessmentQuiz";
import { entitlementRedirectPath, hasActiveAccess } from "@/lib/access";
import { currentStudent, isStaff } from "@/lib/auth";
import {
  getAssessmentBank,
  getAssessmentDoc,
  getAssessmentWrittenHtml,
  getCourseStatuses,
  getLessonRows,
} from "@/lib/content";
import { findCourse, getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";
import {
  ASSESSMENT_SIZE,
  issueAssessmentAttempt,
} from "@/lib/assessment-attempt";
import { prioritizeFreshQuestions } from "@/lib/assessment-selection";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = findCourse(slug);
  return found ? { title: `${found.course.code} Course Assessment` } : {};
}

export default async function AssessmentPage({ params }: Props) {
  const { slug } = await params;
  const found = findCourse(slug);
  if (!found) notFound();
  const { module, course } = found;

  const student = await currentStudent();
  const staffPreview = student ? isStaff(student) : false;
  const available = getCourseStatuses().some(
    (status) =>
      status.course.slug === course.slug &&
      status.complete &&
      (status.available || staffPreview),
  );
  if (!available) redirect(`/curriculum/${module.slug}`);

  if (!student) redirect(`/login?next=/courses/${slug}/assessment`);

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!staffPreview && !hasActiveAccess(enrollments, module.slug))
    redirect(entitlementRedirectPath(enrollments));

  const rows = getLessonRows(module, course);
  const progress = await db.getProgress(student.id);
  const done = new Set(progress.map((item) => item.lessonId));
  if (!staffPreview && !rows.every((row) => done.has(row.id)))
    redirect(`/courses/${slug}`);

  const assessment = getAssessmentDoc(module, course);
  if (!assessment.body.trim()) notFound();
  const { grading } = getCurriculum();
  const bank = getAssessmentBank(module, course);
  const writtenHtml = getAssessmentWrittenHtml(module, course);
  const latestSubmission = await db.getLatestAssessmentSubmission(
    student.id,
    course.slug,
  );
  const publicBank = bank.map((question) => ({
    id: question.id,
    stem: question.stem,
    options: question.options.map((option) => option.text),
  }));
  for (let index = publicBank.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [publicBank[index], publicBank[target]] = [
      publicBank[target],
      publicBank[index],
    ];
  }
  const previousIds = await db.getLatestAssessmentQuestionIds(
    student.id,
    course.slug,
  );
  const questions = prioritizeFreshQuestions(
    publicBank,
    previousIds,
    ASSESSMENT_SIZE,
  );
  const attemptToken = issueAssessmentAttempt(
    student.id,
    course.slug,
    questions.map((question) => question.id),
  );

  return (
    <main className="shell" id="main-content" tabIndex={-1}>
      <div className="topicwrap">
        <div className="breadcrumb">
          <Link href={`/curriculum/${module.slug}`}>{module.short_title}</Link>
          <span className="sep">/</span>
          <Link href={`/courses/${course.slug}`}>{course.code}</Link>
          <span className="sep">/</span>
          Assessment
        </div>

        <header className="topichead">
          <h1>{assessment.meta.title ?? `${course.code} Course Assessment`}</h1>
          <p className="deck">
            Complete every section. Multiple-choice results appear immediately;
            written work is reviewed by your instructor.
          </p>
          <div className="pillrow">
            <span className="pill">100 points</span>
            <span className="pill quiet">Pass mark {grading.pass_mark}%</span>
          </div>
        </header>

        <AssessmentQuiz
          preview={staffPreview}
          bank={questions}
          attemptToken={attemptToken}
          courseSlug={course.slug}
          passMark={grading.pass_mark}
          writtenHtml={writtenHtml}
          existingSubmission={
            latestSubmission && !staffPreview
              ? {
                  id: latestSubmission.id,
                  sectionACorrect: latestSubmission.sectionACorrect,
                  sectionATotal: latestSubmission.sectionATotal,
                  status: latestSubmission.status,
                  sectionAPoints: latestSubmission.sectionAPoints,
                  totalScore: latestSubmission.totalScore,
                  feedback: latestSubmission.feedback,
                }
              : null
          }
        />

        <nav className="topicnav">
          <Link href={`/courses/${course.slug}`}>
            <span className="dir">Back</span>
            <span className="nm">{course.title}</span>
          </Link>
          <span />
        </nav>
      </div>
    </main>
  );
}
