import assert from "node:assert/strict";
import { reportingQuiz } from "../lib/learning-activity";
import { indexLearningActivity, summarizeLearning } from "../lib/progress-report";
import type { LearningActivity, QuizAttempt } from "../lib/db/types";

const now = Date.parse("2026-10-03T12:00:00Z");
const base: QuizAttempt = { id: "q1", studentId: "a", courseSlug: "st-101", lessonId: "st-101-1", kind: "topic", correct: 0, total: 5, scorePct: 0, passed: false, createdAt: "2026-10-03T11:59:00Z" };
const running = reportingQuiz(base, { timer: { deadline: now + 60000, state: "started", questionIds: [] } }, now);
const expired = reportingQuiz({ ...base, id: "expired", lessonId: "st-101-2" }, { timer: { deadline: now - 1, state: "started", questionIds: [] } }, now);
assert.equal(running.state, "in-progress");
assert.equal(expired.state, "expired");
const courses = [{ slug: "st-101", title: "Theology", moduleSlug: "module-1", lessonIds: ["st-101-1", "st-101-2"] }];
const activity: LearningActivity = {
  progress: [
    { studentId: "a", lessonId: "st-101-1", completedAt: base.createdAt },
    { studentId: "a", lessonId: "st-101-1", completedAt: base.createdAt },
    { studentId: "a", lessonId: "outside-scope", completedAt: base.createdAt },
    { studentId: "b", lessonId: "st-101-2", completedAt: base.createdAt },
  ],
  quizzes: [running, expired, reportingQuiz({ ...base, id: "old", createdAt: "2026-10-01T12:00:00Z", scorePct: 80, passed: true }, null, now)],
  assessments: [
    { studentId: "a", courseSlug: "st-101", createdAt: base.createdAt, status: "graded", totalScore: 80 },
    { studentId: "a", courseSlug: "st-101", createdAt: "2026-10-01T00:00:00Z", status: "graded", totalScore: 20 },
  ],
  posts: [
    { studentId: "a", moduleSlug: "module-1", lessonId: "st-101-1", engagementCredits: 3, createdAt: base.createdAt },
    { studentId: "a", moduleSlug: "module-2", engagementCredits: 9, createdAt: base.createdAt },
  ],
};
const indexed = indexLearningActivity(activity);
const summary = summarizeLearning(indexed.get("a"), courses, now);
assert.equal(summary.completed.size, 1, "Deduplicate completion and exclude other modules/students");
assert.equal(summary.percent, 50);
assert.equal(summary.attempts, 2, "Do not score running quizzes");
assert.equal(summary.averageScore, 40, "Expired attempt counts as zero");
assert.equal(summary.needsRetry, 1);
assert.equal(summary.passedCourses, 1, "Latest assessment supersedes older failure; 80 passes");
assert.equal(summary.posts, 1);
assert.equal(summary.credits, 3);
assert.equal(summary.activeThisWeek, true);
assert.equal(summarizeLearning(indexed.get("a"), courses, now + 8 * 86400000).activeThisWeek, false);
assert.equal(summarizeLearning(undefined, courses, now).lastActivity, null);
assert.equal(summarizeLearning(undefined, [], now).percent, 0);
console.log("Progress reporting checks passed.");
