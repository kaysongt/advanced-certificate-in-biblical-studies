import { canPreviewCourses } from "@/lib/course-preview";
import type { Student } from "@/lib/db/types";
import { changeLearningMode } from "@/app/courses/mode-actions";

export default function LearningModeBanner({ student, preview }: { student: Student | null; preview: boolean }) {
  if (!student || !canPreviewCourses(student)) return null;
  return <aside className="notice" aria-label="Learning mode">
    <strong>{preview ? "Staff preview — no results saved" : "Study mode — your progress is saved"}</strong>
    <p>{preview ? "Use preview to review course content. Quizzes here do not count, and assessments cannot be submitted. Switch to study mode before doing assessed work." : "Pass each lesson quiz, then select Mark complete. Assessments unlock after all lessons are complete. Your staff and admin controls remain available."}</p>
    <form action={changeLearningMode}>
      <input type="hidden" name="mode" value={preview ? "study" : "preview"} />
      <button className="btn" type="submit">{preview ? "Switch to study mode" : "Switch to staff preview"}</button>
      <p className="hint">Switch before starting a quiz. Switching returns you to My Studies and does not pause a running timer.</p>
    </form>
  </aside>;
}
