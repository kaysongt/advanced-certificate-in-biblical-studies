"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasStudyAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { canPreviewCourses } from "@/lib/course-preview";
import { getAssessmentBank, getLessonRows } from "@/lib/content";
import { findCourse, getCurriculum, isModuleReleased } from "@/lib/curriculum";
import { db } from "@/lib/db";
import { meetsPassMark } from "@/lib/learning-progress";
import { quizTimeExpired, quizRetryAt } from "@/lib/timed-quiz";
import {
  ASSESSMENT_SIZE,
  verifyAssessmentAttempt,
} from "@/lib/assessment-attempt";

const answerSchema = z.object({
  questionId: z.string().min(1).max(120),
  answer: z.string().max(2000),
});
const attemptSchema = z.object({
  courseSlug: z.string().min(1).max(40),
  answers: z.array(answerSchema).min(1).max(100),
});

export type AssessmentAttemptResult = {
  submissionId?: string;
  correct: number;
  total: number;
  pct: number;
  sectionAPoints: number;
  error?: string;
  retryAt?: number;
};

export async function submitAssessmentSectionA(
  courseSlug: string,
  answers: { questionId: string; answer: string }[],
  attemptToken: string,
  timedAttemptId: string,
): Promise<AssessmentAttemptResult> {
  const parsed = attemptSchema.safeParse({ courseSlug, answers });
  if (!parsed.success)
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error: "Invalid attempt.",
    };
  if (
    new Set(parsed.data.answers.map((answer) => answer.questionId)).size !==
    parsed.data.answers.length
  ) {
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error: "Duplicate questions are not allowed.",
    };
  }

  const student = await currentStudent();
  if (!student)
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error: "Sign in again.",
    };
  if (canPreviewCourses(student))
    return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Preview does not record submissions." };
  const found = findCourse(parsed.data.courseSlug);
  if (!found)
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error: "Course not found.",
    };
  if (!isModuleReleased(found.module)) {
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error: "This module has not opened yet.",
    };
  }

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasStudyAccess(student, enrollments, found.module.slug)) {
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error: "Active enrollment required.",
    };
  }
  const progress = new Set(
    (await db.getProgress(student.id)).map((item) => item.lessonId),
  );
  if (
    !getLessonRows(found.module, found.course).every((row) =>
      progress.has(row.id),
    )
  ) {
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error: "Complete every topic first.",
    };
  }

  const bank = new Map(
    getAssessmentBank(found.module, found.course).map((question) => [
      question.id,
      question,
    ]),
  );
  if (
    parsed.data.answers.length !== Math.min(ASSESSMENT_SIZE, bank.size) ||
    typeof attemptToken !== "string" ||
    !verifyAssessmentAttempt(
      attemptToken,
      student.id,
      found.course.slug,
      parsed.data.answers.map((answer) => answer.questionId),
    )
  ) {
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error:
        "This attempt is incomplete or has expired. Refresh the page for a fresh assessment.",
    };
  }
  const timed = typeof timedAttemptId === "string" ? await db.getTimedQuiz(timedAttemptId, student.id) : null;
  if (!timed || timed.courseSlug !== courseSlug || timed.lessonId !== null || timed.timer.state !== "started" || JSON.stringify(timed.timer.questionIds) !== JSON.stringify(parsed.data.answers.map((answer) => answer.questionId)))
    return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Start or resume the timed assessment before submitting." };
  if (quizTimeExpired(timed.timer.deadline))
    return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Time is up. This attempt failed. A new course assessment is available 24 hours after this attempt began.", retryAt: quizRetryAt(timed) };
  const existing = await db.getLatestAssessmentSubmission(
    student.id,
    found.course.slug,
  );
  if (existing?.status === "in-progress") {
    return {
      submissionId: existing.id,
      correct: existing.sectionACorrect,
      total: existing.sectionATotal,
      pct: Math.round(
        (existing.sectionACorrect / existing.sectionATotal) * 100,
      ),
      sectionAPoints: existing.sectionAPoints,
    };
  }
  if (
    existing?.status === "pending-review" ||
    (existing?.status === "graded" &&
      (existing.totalScore ?? 0) >= getCurriculum().grading.pass_mark)
  ) {
    return {
      correct: 0,
      total: 0,
      pct: 0,
      sectionAPoints: 0,
      error:
        "Your assessment is already submitted or passed. Refresh to see its status.",
    };
  }
  let correct = 0;
  for (const answer of parsed.data.answers) {
    const question = bank.get(answer.questionId);
    if (!question) {
      return {
        correct: 0,
        total: 0,
        pct: 0,
        sectionAPoints: 0,
        error: "Assessment bank changed. Start again.",
      };
    }
    const selected = question.options.find(
      (option) => option.text === answer.answer,
    );
    if (selected?.correct) correct += 1;
  }

  const total = parsed.data.answers.length;
  const pct = Math.round((correct / total) * 100);
  const sectionAPoints = Math.round((correct / total) * 40);
  const passed = meetsPassMark(correct, total, getCurriculum().grading.pass_mark);
  const saved = await db.finishTimedQuiz({
    id: timed.id,
    studentId: student.id,
    correct,
    total,
    scorePct: pct,
    passed,
    answers: parsed.data.answers,
    sectionAPoints,
  });
  if (saved.status !== "saved") return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: saved.status === "expired" ? "Time is up. This attempt failed." : "This attempt has already been submitted." };
  return { submissionId: saved.submissionId, correct, total, pct, sectionAPoints };
}

const writtenSchema = z.object({
  submissionId: z.string().uuid(),
  response: z.string().trim().min(100).max(30000),
});

export type WrittenSubmissionResult = { success: boolean; error?: string };

export async function submitWrittenAssessment(
  submissionId: string,
  response: string,
  courseSlug: string,
): Promise<WrittenSubmissionResult> {
  const parsed = writtenSchema.safeParse({ submissionId, response });
  if (!parsed.success) {
    return {
      success: false,
      error:
        "Write at least 100 characters and include every required response.",
    };
  }
  const student = await currentStudent();
  if (!student) return { success: false, error: "Sign in again." };
  if (canPreviewCourses(student))
    return { success: false, error: "Preview does not record submissions." };
  if (typeof courseSlug !== "string" || courseSlug.length > 40)
    return { success: false, error: "Course not found." };
  const submissionForAccess = await db.getLatestAssessmentSubmission(student.id, courseSlug);
  if (!submissionForAccess || submissionForAccess.id !== parsed.data.submissionId)
    return { success: false, error: "Assessment not found." };
  const found = findCourse(submissionForAccess.courseSlug);
  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!found || !isModuleReleased(found.module) || !hasStudyAccess(student, enrollments, found.module.slug))
    return { success: false, error: "Course access is required to submit this assessment." };
  const done = new Set((await db.getProgress(student.id)).map((item) => item.lessonId));
  if (!getLessonRows(found.module, found.course).every((row) => done.has(row.id)))
    return { success: false, error: "Complete every lesson before submitting the course assessment." };
  const submission = await db.submitAssessmentWrittenWork(
    parsed.data.submissionId,
    student.id,
    parsed.data.response,
  );
  if (!submission)
    return {
      success: false,
      error: "This attempt can no longer be submitted.",
    };
  revalidatePath(`/courses/${submission.courseSlug}/assessment`);
  revalidatePath("/admin");
  return { success: true };
}
