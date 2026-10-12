"use client";
import { useState } from "react";
import { saveRubric } from "@/app/admin/thesis/actions";
import { draftThesisCriteria } from "@/lib/thesis-rubric";
import ThesisActionForm from "./ThesisActionForm";

export default function ThesisRubricEditor({ modules, initial }: {
  modules: { slug: string; title: string }[];
  initial?: { moduleSlug: string; title: string; instructions: string; criteria: typeof draftThesisCriteria };
}) {
  const [criteria, setCriteria] = useState(initial?.criteria ?? draftThesisCriteria);
  return <ThesisActionForm action={saveRubric} label="Save new draft version">
    <label>Module<select name="moduleSlug" defaultValue={initial?.moduleSlug}>{modules.map(m => <option key={m.slug} value={m.slug}>{m.title}</option>)}</select></label>
    <label>Rubric title<input name="title" required maxLength={150} defaultValue={initial?.title ?? "Module thesis — draft marking rubric"} /></label>
    <label>Assignment instructions<textarea name="instructions" required minLength={30} maxLength={8000} rows={5} defaultValue={initial?.instructions ?? "Write a thesis exploring a central doctrine from this module. Present a clear argument grounded in Scripture, engage with the course material, and explain specific implications for life and ministry. Cite your sources. Staff must confirm the topic, word count, deadline, and resubmission policy before publishing."} /></label>
    {criteria.map((row, index) => <div className="notice" key={index}>
      <label>Criterion {index + 1}<input value={row.title} maxLength={120} required onChange={e => setCriteria(criteria.map((r, i) => i === index ? { ...r, title: e.target.value } : r))} /></label>
      <label>Points<input type="number" min={1} max={100} required value={row.points} onChange={e => setCriteria(criteria.map((r, i) => i === index ? { ...r, points: Number(e.target.value) } : r))} /></label>
      <label>Marking guidance<textarea rows={3} required minLength={10} maxLength={1500} value={row.description} onChange={e => setCriteria(criteria.map((r, i) => i === index ? { ...r, description: e.target.value } : r))} /></label>
    </div>)}
    <p>Total: <strong>{criteria.reduce((sum, row) => sum + row.points, 0)}/100</strong>. Saving creates a draft, not an approved policy.</p>
    <input type="hidden" name="criteria" value={JSON.stringify(criteria)} />
  </ThesisActionForm>;
}
