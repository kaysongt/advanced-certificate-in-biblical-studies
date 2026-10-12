import { z } from "zod";

export const criteriaSchema = z.array(z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1500),
  points: z.number().int().min(1).max(100),
})).min(3).max(10).refine(rows => rows.reduce((sum, row) => sum + row.points, 0) === 100, "Criteria must total 100 points.");

export const draftThesisCriteria = [
  { title: "Biblical accuracy and interpretation", points: 30, description: "Accurate doctrine, relevant Scripture interpreted in context, and careful distinction between the text and personal inference." },
  { title: "Understanding and argument", points: 25, description: "A clear thesis, coherent reasoning, thoughtful connections between doctrines, and engagement with relevant alternatives." },
  { title: "Application to life and ministry", points: 20, description: "Specific, realistic application showing how learning informs conduct and ministry rather than general statements." },
  { title: "Evidence and attribution", points: 15, description: "Appropriate use of course materials and clearly attributed sources. Flag uncertain citations for instructor verification, not automatic penalties." },
  { title: "Structure and clarity", points: 10, description: "A coherent introduction, organized development and conclusion. Prioritize understandable reasoning over language polish." },
];

export const suggestionSchema = z.object({
  criteria: z.array(z.object({ title: z.string(), score: z.number().int().min(0).max(100), feedback: z.string().max(2000) })).min(3).max(10),
  feedback: z.string().min(10).max(5000),
  reviewFlags: z.array(z.string().max(1000)).max(10),
});

export function validateSuggestion(value: unknown, criteria: z.infer<typeof criteriaSchema>) {
  const suggestion = suggestionSchema.parse(value);
  if (suggestion.criteria.length !== criteria.length || suggestion.criteria.some((row, i) => row.title !== criteria[i].title || row.score > criteria[i].points)) {
    throw new Error("AI returned scores that do not match the rubric.");
  }
  return { ...suggestion, total: suggestion.criteria.reduce((sum, row) => sum + row.score, 0) };
}
