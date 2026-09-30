"use server";

import { currentStudent } from "@/lib/auth";
import { canPreviewCourses } from "@/lib/course-preview";
import { hasStudyAccess } from "@/lib/access";
import { findCourse, isModuleReleased } from "@/lib/curriculum";
import { getLessonRows, getLessonQuizQuestions, getAssessmentBank } from "@/lib/content";
import { ASSESSMENT_SIZE, verifyAssessmentAttempt } from "@/lib/assessment-attempt";
import { db } from "@/lib/db";
import { quizTimeExpired, quizRetryAt } from "@/lib/timed-quiz";

export type QuizStartResult = { id?: string; deadline?: number; serverNow?: number; error?: string; retryAt?: number };

export async function startTimedQuiz(courseSlug: string, lessonId: string | null, questionIds: string[] = [], token = ""): Promise<QuizStartResult> {
  const student = await currentStudent();
  if (!student || canPreviewCourses(student)) return { error: "Sign in with a student account. Preview does not record attempts." };
  if (typeof courseSlug !== "string" || courseSlug.length > 40 || (lessonId !== null && (typeof lessonId !== "string" || lessonId.length > 60))) return { error: "Invalid assessment." };
  const found = findCourse(courseSlug);
  if (!found || !isModuleReleased(found.module)) return { error: "This module has not opened yet." };
  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasStudyAccess(student, enrollments, found.module.slug)) return { error: "A cleared enrollment is required for this module." };
  const rows = getLessonRows(found.module, found.course);
  const done = new Set((await db.getProgress(student.id)).map((r) => r.lessonId));
  const lesson = lessonId ? rows.find((r) => r.id === lessonId) : null;
  if (lessonId && !lesson) return { error: "Lesson not found." };
  if (rows.some((r) => (!lesson || r.n < lesson.n) && !done.has(r.id))) return { error: "Complete the earlier lessons first. Course assessments require every lesson to be complete." };
  const existing = await db.getLatestTimedQuiz(student.id, courseSlug, lessonId);
  if (existing && existing.timer.state === "started" && !quizTimeExpired(existing.timer.deadline)) {
    if (!lessonId && JSON.stringify(questionIds) !== JSON.stringify(existing.timer.questionIds)) return { error: "An attempt is already running. Refresh to resume its questions; the original timer continues." };
    return { id: existing.id, deadline: existing.timer.deadline, serverNow: Date.now() };
  }
  if (existing && Date.now() < quizRetryAt(existing)) return { error: lessonId ? "A failed or timed-out lesson quiz requires a one-hour wait." : "You must wait 24 hours between course-assessment attempts.", retryAt: quizRetryAt(existing) };
  let total: number;
  if (lesson) {
    total = getLessonQuizQuestions(found.module, found.course, lesson.n).length;
    questionIds = [];
  } else {
    const previous = await db.getLatestAssessmentSubmission(student.id, courseSlug);
    if (previous && (previous.status !== "graded" || (previous.totalScore ?? 0) >= 80)) return { error: "Your assessment is already in progress, awaiting review, or passed. Refresh to see its status." };
    total = Math.min(ASSESSMENT_SIZE, getAssessmentBank(found.module, found.course).length);
    if (!Array.isArray(questionIds) || questionIds.length !== total || typeof token !== "string" || !verifyAssessmentAttempt(token, student.id, courseSlug, questionIds)) return { error: "Refresh the page to load a valid question set." };
  }
  if (!total) return { error: "This quiz is not available yet." };
  const result = await db.beginTimedQuiz({ studentId: student.id, courseSlug, lessonId, total, questionIds });
  if (!result.attempt) return { error: "The mandatory waiting period has not ended.", retryAt: result.retryAt ?? undefined };
  if (!lessonId && JSON.stringify(questionIds) !== JSON.stringify(result.attempt.timer.questionIds)) return { error: "An attempt is already running. Refresh to resume its questions." };
  return { id: result.attempt.id, deadline: result.attempt.timer.deadline, serverNow: Date.now() };
}
