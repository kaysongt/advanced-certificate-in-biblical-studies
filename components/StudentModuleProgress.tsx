import Link from "next/link";
import type { Module } from "@/lib/curriculum";
import type { AssessmentSubmission, ProgressRecord } from "@/lib/db/types";
import { studentModuleProgress } from "@/lib/student-progress";

export default function StudentModuleProgress({ module, progress, assessments, preview = false }: {
  module: Module; progress: ProgressRecord[]; assessments: (AssessmentSubmission | null)[]; preview?: boolean;
}) {
  const state = studentModuleProgress(module, progress);
  const courseSlugs = new Set(module.courses.map((course) => course.slug));
  const passed = assessments.filter((row) => row && courseSlugs.has(row.courseSlug) && row.status === "graded" && (row.totalScore ?? 0) >= 80).length;
  const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(new Date(value));
  return <section className="student-progress-panel" data-tour="progress" aria-labelledby={`progress-${module.slug}`}>
    <div className="eyebrow">Your module progress · Module {module.numeral}</div>
    <h2 id={`progress-${module.slug}`}>{module.short_title}</h2>
    {preview ? <p className="notice">Staff preview: this shows your own account only. Preview activity does not record student progress.</p> : null}
    <div className="student-progress-summary">
      <div><strong>{state.percent}%</strong><span>Lessons complete</span><small>{state.completed.size} of {state.total} topics</small></div>
      <div><strong>{passed}/{module.courses.length}</strong><span>Course assessments passed</span><small>At least 80% on the final graded result</small></div>
    </div>
    <progress className="student-progress-bar" value={state.completed.size} max={state.total || 1} aria-label={`${module.short_title}: ${state.completed.size} of ${state.total} topics complete`} />
    <p className="student-progress-status">{state.completed.size === state.total ? "All lessons are marked complete. Check your assessment results below and follow KTI’s thesis instructions." : state.week === 0 ? "Your study plan begins when this module opens." : state.behind > 0 ? `You are ${state.behind} topic${state.behind === 1 ? "" : "s"} behind the suggested lesson pace. Set aside a regular study time and continue from your next topic.` : "You’re keeping up with the suggested lesson pace. Keep going!"}</p>
    <details className="student-study-plan"><summary>Suggested study plan{state.week ? ` · ${state.planEnded ? "8-week window elapsed" : `Week ${state.week} of 8`}` : ""}</summary>
      <p>Aim to complete the lessons during the first six weeks, by <strong>{date(state.lessonsTargetDate)}</strong>. Set aside the following two weeks, through <strong>{date(state.reviewTargetDate)}</strong>, for assessments, review, and thesis preparation as directed by KTI.</p>
      <p>Suggested progress by now: {state.target} of {state.total} topics. This is planning guidance, not a submission deadline or an access restriction. Follow any deadlines given by your instructors.</p>
    </details>
    <div className="student-course-progress">{module.courses.map((course) => {
      const done = Array.from({ length: module.lessons_per_course }, (_, n) => `${course.slug}-${n + 1}`).filter((id) => state.completed.has(id)).length;
      const assessment = assessments.find((row) => row?.courseSlug === course.slug);
      const result = !assessment ? "Assessment not submitted" : assessment.status !== "graded" ? "Assessment " + assessment.status.replaceAll("-", " ") : `${assessment.totalScore ?? 0}% · ${(assessment.totalScore ?? 0) >= 80 ? "Passed" : "Retry required"}`;
      return <div key={course.slug}><Link href={`/courses/${course.slug}`}>{course.code} · {course.title}</Link><span>{done}/{module.lessons_per_course} topics complete</span><small>{result}</small></div>;
    })}</div>
    <p className="hint">Progress saves after you pass a lesson quiz with at least 80% and select “Mark complete.” Reading, listening, and downloading alone do not mark a lesson complete. Lesson completion is separate from assessment grades and thesis requirements.</p>
    <Link className="btn primary" href={state.next ? `/courses/${state.next.courseSlug}/${state.next.n}` : `/curriculum/${module.slug}`}>{state.next ? "Continue next topic" : "Review module and assessments"}</Link>
  </section>;
}
