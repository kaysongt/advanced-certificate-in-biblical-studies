import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AdminNav from "@/components/AdminNav";
import { currentStudent, isStaff } from "@/lib/auth";
import { staffLoginPath, STAFF_ACCESS_REQUIRED_PATH } from "@/lib/login-redirect";
import { getCurriculum } from "@/lib/curriculum";
import { getLessonRows } from "@/lib/content";
import { db } from "@/lib/db";
import { loadRegistrationReport } from "@/lib/registration-report";
import { REGISTRATION_GROUPS, registrationGroup, registrationGroupLabel } from "@/lib/registration-groups";
import { indexLearningActivity, summarizeLearning } from "@/lib/progress-report";

export const metadata: Metadata = { title: "Student progress", robots: { index: false, follow: false } };

const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(value)) + " WAT" : "No recorded activity";

export default async function ProgressPage({ searchParams }: {
  searchParams: Promise<{ module?: string; group?: string; q?: string; student?: string; page?: string }>;
}) {
  const actor = await currentStudent();
  if (!actor) redirect(staffLoginPath("/admin/progress"));
  if (!isStaff(actor)) redirect(STAFF_ACCESS_REQUIRED_PATH);
  const params = await searchParams;
  const modules = getCurriculum().modules;
  const moduleSlug = params.module === "all" ? "all" : modules.find((module) => module.slug === params.module)?.slug ?? modules[0].slug;
  const group = registrationGroup(params.group);
  const query = (params.q ?? "").trim().slice(0, 150);
  const catalog = modules.filter((module) => moduleSlug === "all" || module.slug === moduleSlug).flatMap((module) => module.courses.map((course) => {
    const lessons = getLessonRows(module, course);
    return { slug: course.slug, title: `${course.code} · ${course.title}`, moduleSlug: module.slug, lessons, lessonIds: lessons.map((row) => row.id) };
  }));
  const [report, activity] = await Promise.all([loadRegistrationReport(), db.getLearningActivity()]);
  const indexed = indexLearningActivity(activity);
  const students = report.students.filter((student) => student.role === "student");
  const cohort = students.filter((student) => !group || report.evidence.get(student.id)?.group === group).map((student) => ({
    student, summary: summarizeLearning(indexed.get(student.id), catalog),
  }));
  const visible = cohort.filter(({ student }) => `${student.fullName} ${student.email}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(visible.length / 25));
  const page = Math.max(1, Math.min(pages, Math.floor(Number(params.page)) || 1));
  const url = (extra: Record<string, string>) => `/admin/progress?${new URLSearchParams({ module: moduleSlug, ...(group ? { group } : {}), q: query, ...extra })}`;
  const selected = cohort.find(({ student }) => student.id === params.student);
  const totalLessons = catalog.reduce((sum, course) => sum + course.lessonIds.length, 0);
  const completion = cohort.length && totalLessons ? Math.round(cohort.reduce((sum, row) => sum + row.summary.completed.size, 0) / (cohort.length * totalLessons) * 100) : null;

  return <main className="shell admin-shell" id="main-content" tabIndex={-1}>
    <header className="pagehead"><div className="eyebrow">KingsWord administration</div><h1>Student progress</h1><p className="deck">See how your students are learning, participating, and moving through the program.</p></header>
    <AdminNav pendingScholarshipCount={report.pendingScholarships} />
    <form className="learning-filters" action="/admin/progress">
      <label>Module<select name="module" defaultValue={moduleSlug}>{modules.map((module) => <option key={module.slug} value={module.slug}>{module.short_title}</option>)}<option value="all">Full program (includes future modules)</option></select></label>
      <label>Registration group<select name="group" defaultValue={group ?? ""}><option value="">All students</option>{REGISTRATION_GROUPS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>Find a student<input name="q" defaultValue={query} placeholder="Name or email" maxLength={150} /></label>
      <button className="btn primary" type="submit">Apply filters</button>
    </form>
    <section className="admin-section" aria-labelledby="overview-title">
      <h2 id="overview-title">Group overview</h2>
      <p>For {group ? registrationGroupLabel(group).toLowerCase() : "all student accounts"} in the selected module scope. Staff and test accounts are excluded. Searching a name only filters the roster below.</p>
      <div className="learning-stats">
        {[[cohort.length, "Students"], [completion === null ? "—" : `${completion}%`, "Average lesson completion"], [cohort.filter((row) => row.summary.activeThisWeek).length, "Active in the last 7 days"], [cohort.filter((row) => !row.summary.lastActivity).length, "No recorded activity"], [cohort.reduce((sum, row) => sum + row.summary.posts, 0), "Discussion contributions"], [cohort.filter((row) => row.summary.needsRetry > 0).length, "Students with a quiz to retry"]].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </div>
      <p className="learning-note">Completion counts saved “Mark complete” lessons out of {totalLessons} topics in this scope, including students who have not started. Activity includes quiz starts/submissions, lesson completions, and visible discussion posts. It does not measure logins, reading time, or audio listening. Engagement credits are separate from grades.</p>
    </section>
    <section className="admin-section" aria-labelledby="roster-title">
      <h2 id="roster-title">Individual students <small>({visible.length})</small></h2>
      {visible.length ? <><div className="learning-table-wrap" role="region" aria-label="Student progress roster" tabIndex={0}><table className="learning-table"><thead><tr><th>Student</th><th>Lessons complete</th><th>Course assessments passed</th><th>Discussion</th><th>Last learning activity</th></tr></thead><tbody>
        {visible.slice((page - 1) * 25, page * 25).map(({ student, summary }) => <tr key={student.id}>
          <td><Link href={url({ student: student.id, page: String(page) }) + "#student-detail"}>{student.fullName}</Link><small>{student.email}</small><small>{registrationGroupLabel(report.evidence.get(student.id)!.group)}</small></td>
          <td><strong>{summary.percent}%</strong><progress value={summary.completed.size} max={totalLessons || 1} aria-label={`${student.fullName}: lesson completion`} /><small>{summary.completed.size} / {totalLessons} topics</small></td>
          <td>{summary.passedCourses} / {catalog.length}{summary.needsRetry > 0 ? <small>{summary.needsRetry} quiz target(s) awaiting a passing result</small> : null}</td>
          <td>{summary.posts} posts<small>{summary.credits} credits</small></td><td>{date(summary.lastActivity)}</td>
        </tr>)}
      </tbody></table></div><nav className="learning-pagination" aria-label="Student pages">{page > 1 ? <Link className="btn quiet" href={url({ page: String(page - 1) })}>Previous</Link> : null}<span>Page {page} of {pages}</span>{page < pages ? <Link className="btn quiet" href={url({ page: String(page + 1) })}>Next</Link> : null}</nav></> : <p className="notice">No students match these filters.</p>}
    </section>
    {selected ? <section className="admin-section" id="student-detail" aria-labelledby="student-title">
      <div className="eyebrow">Individual learning record</div><h2 id="student-title">{selected.student.fullName}</h2><p>{selected.student.email} · {registrationGroupLabel(report.evidence.get(selected.student.id)!.group)}</p>
      <p>{selected.summary.completed.size} of {totalLessons} topics complete · {selected.summary.attempts} finished quiz attempts · Average attempt score: {selected.summary.averageScore === null ? "No scores yet" : `${selected.summary.averageScore}%`} · {selected.summary.posts} discussion posts · {selected.summary.credits} engagement credits</p>
      <p className="learning-note">Quiz averages include retries and expired attempts; running quizzes have no score yet. Course assessment pass counts use the latest graded result with a score of at least 80%.</p>
      {catalog.map((course) => {
        const assessment = selected.summary.latestAssessments.get(course.slug);
        return <details className="learning-course" key={course.slug} open={catalog.length === 1}>
          <summary>{course.title} <span>{course.lessonIds.filter((id) => selected.summary.completed.has(id)).length}/{course.lessonIds.length} topics</span></summary>
          <p>Course assessment: {assessment ? `${assessment.status.replaceAll("-", " ")}${assessment.status === "graded" && assessment.totalScore !== null ? ` · ${assessment.totalScore}% · ${assessment.totalScore >= 80 ? "Passed" : "Retry required"}` : ""}` : "No submission yet"}</p>
          <ol className="learning-lessons">{course.lessons.map((lesson) => {
            const quiz = selected.summary.latestQuizzes.get(lesson.id);
            return <li key={lesson.id}><strong>{lesson.title}</strong><span>{selected.summary.completed.has(lesson.id) ? "Complete" : "Not marked complete"} · Latest quiz: {quiz ? quiz.state === "in-progress" ? "In progress" : `${quiz.scorePct}% · ${quiz.passed ? "Passed" : quiz.state === "expired" ? "Time expired" : "Retry required"}` : "Not attempted"}</span></li>;
          })}</ol>
          <details><summary>Quiz attempt history</summary>{selected.summary.quizzes.filter((quiz) => quiz.courseSlug === course.slug).length ? <ul className="learning-lessons">{selected.summary.quizzes.filter((quiz) => quiz.courseSlug === course.slug).map((quiz) => <li key={quiz.id}><strong>{quiz.lessonId ? course.lessons.find((lesson) => lesson.id === quiz.lessonId)?.title ?? quiz.lessonId : "Course assessment"}</strong><span>{date(quiz.activityAt)} · {quiz.state === "in-progress" ? "In progress" : `${quiz.scorePct}% · ${quiz.passed ? "Passed" : quiz.state === "expired" ? "Time expired" : "Did not pass"}`}</span></li>)}</ul> : <p>No attempts recorded.</p>}</details>
        </details>;
      })}
    </section> : params.student ? <p className="notice">That student is not in the selected group. Clear the group filter to search again.</p> : <p className="notice">Select a student’s name to view lesson completion and quiz history.</p>}
  </main>;
}
