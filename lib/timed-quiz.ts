export const LESSON_QUIZ_MS = 5 * 60 * 1000;
export const COURSE_QUIZ_MS = 15 * 60 * 1000;
export type RunningQuiz = { id: string; deadline: number; serverNow: number };
export function formatQuizRetryTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(value)) + " WAT (Nigeria time)";
}
export type QuizTimerData = { deadline: number; state: "started" | "submitted"; questionIds: string[]; finishedAt?: number };
export type TimedQuiz = { id: string; studentId: string; courseSlug: string; lessonId: string | null; timer: QuizTimerData; passed: boolean; startedAt: number };
export const LESSON_RETRY_MS = 60 * 60 * 1000;
export const COURSE_RETRY_MS = 24 * 60 * 60 * 1000;
export type BeginQuizInput = { studentId: string; courseSlug: string; lessonId: string | null; total: number; questionIds: string[] };
export type BeginQuizResult = { attempt: TimedQuiz | null; retryAt: number | null };

export function quizRetryAt(attempt: TimedQuiz): number {
  if (attempt.lessonId === null) return attempt.startedAt + COURSE_RETRY_MS;
  if (attempt.passed) return 0;
  return (attempt.timer.finishedAt ?? attempt.timer.deadline) + LESSON_RETRY_MS;
}

export function readQuizTimer(answers: unknown): QuizTimerData | null {
  if (!answers || typeof answers !== "object" || !("timer" in answers)) return null;
  const value = answers.timer as Partial<QuizTimerData> | null;
  if (!value || !Number.isFinite(value.deadline) || !["started", "submitted"].includes(value.state ?? "") || !Array.isArray(value.questionIds) || !value.questionIds.every((id) => typeof id === "string")) return null;
  return value as QuizTimerData;
}

export function quizTimeExpired(deadline: number, now = Date.now()): boolean {
  return !Number.isFinite(deadline) || now >= deadline;
}
