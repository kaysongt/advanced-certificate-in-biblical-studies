# Thesis review and staff study mode

Staff now study normally by default after launch. The learning-mode banner allows
explicit ungraded preview; preview retains release bypass but rejects all progress
and assessment writes. A cookie cannot grant preview permission to a student.
Historical preview answers were never persisted and cannot be reconstructed.

## Thesis launch checklist

1. Open /admin/thesis. Review the editable draft (30/25/20/15/10 points).
2. Confirm assignment topic, word count, deadline and resubmission policy in the
   instructions. Save a draft, inspect it, then explicitly approve and publish.
3. Students with access find Module thesis on their module page. Draft rubrics
   are never exposed to students. Existing submissions retain their original rubric.
4. Staff may request AI suggestions. Review every criterion and citation, then
   enter the final score and feedback and confirm instructor review.
5. Thesis grades remain separate from course scores and community credits until
   KTI confirms how they contribute to the overall award.

AI uses the installed AI SDK through Vercel AI Gateway (runtime OIDC or
AI_GATEWAY_API_KEY). THESIS_AI_MODEL optionally overrides the verified catalog
default. Gateway credentials/credits must be available; errors leave grades
untouched. Do not claim AI grading is operational until a generation succeeds
in the deployed environment. Only text, instructions and criteria are sent,
not account names/emails (unless included by the student in the text).
Suggestions are staff-only, bounded by the rubric, and never automatically
published. Ten generation requests per staff member per hour; no automatic
retries. Instructors cannot finalize their own thesis.

Each rubric save creates an immutable version. Publishing a new version does not
change previous submissions. One submission per student/rubric is accepted;
network retries do not overwrite work. Students should keep a document copy.

Migration: 20261012000000_thesis_review adds two tables; it changes no existing
student progress, grades, enrollment or payment history.
