import type { QuizAttempt } from "./db/types";
import { readQuizTimer } from "./timed-quiz";

/** Running timers are not failed attempts until their deadline passes. */
export function reportingQuiz(attempt: QuizAttempt, answers: unknown, now = Date.now()) {
  const timer = readQuizTimer(answers);
  const state = timer?.state === "started"
    ? (now >= timer.deadline ? "expired" : "in-progress")
    : "submitted";
  return {
    ...attempt,
    state: state as "expired" | "in-progress" | "submitted",
    scorePct: state === "expired" ? 0 : attempt.scorePct,
    passed: state === "expired" ? false : attempt.passed,
    activityAt: timer?.finishedAt ? new Date(timer.finishedAt).toISOString() : attempt.createdAt,
  };
}
