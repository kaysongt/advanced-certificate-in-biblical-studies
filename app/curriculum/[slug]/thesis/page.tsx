import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentStudent } from "@/lib/auth";
import { db, hasDurableStorage } from "@/lib/db";
import { prisma } from "@/lib/db/prisma";
import { getModule, isModuleReleased } from "@/lib/curriculum";
import { hasStudyAccess } from "@/lib/access";
import { isCoursePreview } from "@/lib/learning-mode";
import { criteriaSchema } from "@/lib/thesis-rubric";
import LearningModeBanner from "@/components/LearningModeBanner";
import ThesisActionForm from "@/components/ThesisActionForm";
import { submitThesis } from "./actions";

export const metadata = { title: "Module thesis", robots: { index: false, follow: false } };
export default async function ThesisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const module = getModule(slug);
  if (!module) notFound();
  const student = await currentStudent();
  if (!student) redirect("/login");
  const preview = await isCoursePreview(student);
  if (!preview && (!isModuleReleased(module) || !hasStudyAccess(student, await db.getEnrollmentsForStudent(student.id), slug))) redirect("/dashboard");
  const rubric = hasDurableStorage ? await prisma.thesisRubric.findFirst({ where: { moduleSlug: slug, approvedAt: { not: null } }, orderBy: { approvedAt: "desc" } }) : null;
  const submissions = hasDurableStorage ? await prisma.thesisSubmission.findMany({ where: { studentId: student.id, rubric: { moduleSlug: slug } }, include: { rubric: true }, orderBy: { createdAt: "desc" } }) : [];
  return <main className="shell" id="main-content" tabIndex={-1}>
    <LearningModeBanner student={student} preview={preview} />
    <Link href={`/curriculum/${slug}`}>← Back to {module.title}</Link>
    <h1>Module thesis</h1>
    {!rubric ? <p className="notice">KTI is preparing the assignment instructions and marking rubric. Submissions will open after staff approval.</p> : <>
      <h2>{rubric.title}</h2><p style={{ whiteSpace: "pre-wrap" }}>{rubric.instructions}</p>
      <h3>How your work will be assessed</h3>
      {criteriaSchema.parse(rubric.criteria).map(c => <p key={c.title}><strong>{c.title} — {c.points} points.</strong> {c.description}</p>)}
      <p className="notice">An instructor reviews and approves your final grade. AI may assist with initial feedback; it does not award your final grade. Thesis scores are separate from course quiz scores.</p>
      {!preview && !submissions.some(s => s.rubricId === rubric.id) ? <ThesisActionForm action={submitThesis} label="Submit thesis for instructor review">
        <input type="hidden" name="rubricId" value={rubric.id} />
        <label>Your thesis<textarea name="body" required minLength={100} maxLength={60000} rows={18} /></label>
        <p className="hint">Draft in a document and keep a copy before pasting here. A submitted thesis cannot be edited; contact KTI if a correction is needed.</p>
        <label><input type="checkbox" name="confirm" value="yes" required /> This is my own work, and I have attributed my sources.</label>
      </ThesisActionForm> : null}
    </>}
    {submissions.map(s => <section className="notice" key={s.id}>
      <h2>{s.gradedAt ? `Instructor grade: ${s.finalScore}/100` : "Submitted — awaiting instructor review"}</h2>
      <p>{s.rubric.title} · Submitted {s.createdAt.toLocaleDateString("en-GB")}</p>
      {s.gradedAt ? <p style={{ whiteSpace: "pre-wrap" }}>{s.feedback}</p> : null}
      <details><summary>Your submitted thesis</summary><div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{s.body}</div></details>
    </section>)}
  </main>;
}
