import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStudent, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { db, hasDurableStorage } from "@/lib/db";
import { getCurriculum } from "@/lib/curriculum";
import { criteriaSchema, validateSuggestion } from "@/lib/thesis-rubric";
import AdminNav from "@/components/AdminNav";
import ThesisRubricEditor from "@/components/ThesisRubricEditor";
import ThesisActionForm from "@/components/ThesisActionForm";
import { approveRubric, finalizeThesis, suggestThesisReview } from "./actions";

export const metadata = { title: "Thesis reviews", robots: { index: false, follow: false } };
export const maxDuration = 60;

export default async function ThesisAdminPage({ searchParams }: { searchParams: Promise<{ rubric?: string }> }) {
  const actor = await currentStudent();
  if (!actor || !isStaff(actor)) redirect("/login?next=/admin/thesis");
  const { rubric: rubricId } = await searchParams;
  const [rubrics, submissions, pendingCount] = await Promise.all([
    hasDurableStorage ? prisma.thesisRubric.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) : [],
    hasDurableStorage ? prisma.thesisSubmission.findMany({ include: { student: { select: { fullName: true, email: true } }, rubric: true }, orderBy: { createdAt: "desc" }, take: 100 }) : [],
    db.countPendingScholarshipApplications(),
  ]);
  const selected = rubrics.find(r => r.id === rubricId) ?? rubrics[0];
  return <main className="shell" id="main-content" tabIndex={-1}>
    <div className="pagehead"><div className="eyebrow">Staff operations</div><h1>Thesis reviews</h1><p className="deck">Approved criteria. AI-assisted feedback. Instructor-owned final grades.</p></div>
    <AdminNav pendingScholarshipCount={pendingCount} />
    <p className="notice">Thesis grades are recorded separately from course assessments and community credits. They do not change the final program grade automatically. AI suggestions are private to staff; only instructor-approved scores and feedback are shown to students.</p>
    {!hasDurableStorage ? <p className="notice">Connect the database to save rubrics and review submissions.</p> : null}
    <h2>Rubric versions</h2>
    {!rubrics.length ? <p>No saved rubric yet. The editable draft below is ready for staff review.</p> : rubrics.map(r => <article className="notice" key={r.id}>
      <h3>{r.title}</h3><p>{r.moduleSlug} · {r.createdAt.toLocaleDateString("en-GB")} · {r.approvedAt ? "Approved" : "Draft"}</p>
      <Link href={`/admin/thesis?rubric=${r.id}#rubric-editor`}>View / revise this version</Link>
      {!r.approvedAt ? <ThesisActionForm action={approveRubric} label="Approve and publish">
        <input type="hidden" name="id" value={r.id} />
        <details><summary>Review assignment and marking criteria</summary><p style={{ whiteSpace: "pre-wrap" }}>{r.instructions}</p>{criteriaSchema.parse(r.criteria).map(c => <p key={c.title}><strong>{c.title} · {c.points} points.</strong> {c.description}</p>)}</details>
        <label><input type="checkbox" name="confirm" value="yes" required /> I approve these instructions and criteria for student submissions.</label>
      </ThesisActionForm> : null}
    </article>)}
    <details id="rubric-editor" open={!rubrics.length || Boolean(rubricId)}>
      <summary><strong>{selected ? "Revise selected rubric (saves as a new draft)" : "Create the draft rubric"}</strong></summary>
      <ThesisRubricEditor key={selected?.id ?? "new"} modules={getCurriculum().modules.map(m => ({ slug: m.slug, title: m.title }))} initial={selected ? { ...selected, criteria: criteriaSchema.parse(selected.criteria) } : undefined} />
    </details>
    <h2>Student submissions</h2>
    <p className="hint">Showing the latest 100 submissions. AI review sends only the thesis text, assignment, and rubric to the configured AI provider—not the student’s account details. Verify all citations and scores yourself.</p>
    {!submissions.length ? <p>No thesis submissions yet. Students will see the submission link on their module page after a rubric is published.</p> : submissions.map(s => {
      const suggestion = s.aiSuggestion ? validateSuggestion(s.aiSuggestion, criteriaSchema.parse(s.rubric.criteria)) : null;
      return <article className="notice" key={s.id}>
        <h3>{s.student.fullName}</h3><p>{s.student.email} · {s.rubric.title} · {s.createdAt.toLocaleDateString("en-GB")}</p>
        <details><summary>Read submission and approved instructions</summary><p style={{ whiteSpace: "pre-wrap" }}>{s.rubric.instructions}</p><hr /><div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{s.body}</div></details>
        {suggestion ? <section><h4>AI suggestion — not a grade: {suggestion.total}/100</h4>
          {suggestion.criteria.map(row => <p key={row.title}><strong>{row.title}: {row.score}</strong> — {row.feedback}</p>)}
          <p>{suggestion.feedback}</p>{suggestion.reviewFlags.map((flag, i) => <p key={i}>Review: {flag}</p>)}
          <p className="hint">{s.aiModel} · {s.aiReviewedAt?.toLocaleString("en-GB")}</p>
        </section> : !s.gradedAt ? <ThesisActionForm action={suggestThesisReview} label="Generate AI suggestion"><input type="hidden" name="id" value={s.id} /></ThesisActionForm> : null}
        {s.gradedAt ? <p><strong>Instructor grade: {s.finalScore}/100</strong> — {s.feedback}</p> : <ThesisActionForm action={finalizeThesis} label="Publish instructor grade">
          <input type="hidden" name="id" value={s.id} />
          <label>Final instructor score (0–100)<input type="number" name="score" required min={0} max={100} /></label>
          <label>Feedback for the student<textarea name="feedback" required minLength={20} maxLength={5000} rows={4} /></label>
          <label><input type="checkbox" name="confirm" value="yes" required /> I have read the submission and verified the final score and feedback.</label>
        </ThesisActionForm>}
      </article>;
    })}
  </main>;
}
