"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { getAssessmentBank, getLessonRows } from "@/lib/content";
import { findCourse, getCurriculum } from "@/lib/curriculum";
import { db } from "@/lib/db";

const answerSchema = z.object({ questionId: z.string().min(1).max(120), answer: z.string().max(2000) });
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
};

export async function submitAssessmentSectionA(
  courseSlug: string,
  answers: { questionId: string; answer: string }[]
): Promise<AssessmentAttemptResult> {
  const parsed = attemptSchema.safeParse({ courseSlug, answers });
  if (!parsed.success) return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Invalid attempt." };
  if (new Set(parsed.data.answers.map((answer) => answer.questionId)).size !== parsed.data.answers.length) {
    return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Duplicate questions are not allowed." };
  }

  const student = await currentStudent();
  if (!student) return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Sign in again." };
  const found = findCourse(parsed.data.courseSlug);
  if (!found) return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Course not found." };

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasActiveAccess(enrollments, found.module.slug)) {
    return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Active enrollment required." };
  }
  const progress = new Set((await db.getProgress(student.id)).map((item) => item.lessonId));
  if (!getLessonRows(found.module, found.course).every((row) => progress.has(row.id))) {
    return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Complete every topic first." };
  }

  const bank = new Map(getAssessmentBank(found.module, found.course).map((question) => [question.id, question]));
  let correct = 0;
  for (const answer of parsed.data.answers) {
    const question = bank.get(answer.questionId);
    if (!question) {
      return { correct: 0, total: 0, pct: 0, sectionAPoints: 0, error: "Assessment bank changed. Start again." };
    }
    const selected = question.options.find((option) => option.text === answer.answer);
    if (selected?.correct) correct += 1;
  }

  const total = parsed.data.answers.length;
  const pct = Math.round((correct / total) * 100);
  const sectionAPoints = Math.round((correct / total) * 40);
  const passed = pct >= getCurriculum().grading.pass_mark;
  await db.createQuizAttempt({
    studentId: student.id,
    courseSlug: parsed.data.courseSlug,
    lessonId: null,
    kind: "course-assessment",
    correct,
    total,
    scorePct: pct,
    passed,
    answers: parsed.data.answers,
  });
  const submission = await db.createAssessmentSubmission({
    studentId: student.id,
    courseSlug: parsed.data.courseSlug,
    sectionACorrect: correct,
    sectionATotal: total,
    sectionAPoints,
  });
  return { submissionId: submission.id, correct, total, pct, sectionAPoints };
}

const writtenSchema = z.object({
  submissionId: z.string().uuid(),
  response: z.string().trim().min(100).max(30000),
});

export type WrittenSubmissionResult = { success: boolean; error?: string };

export async function submitWrittenAssessment(
  submissionId: string,
  response: string
): Promise<WrittenSubmissionResult> {
  const parsed = writtenSchema.safeParse({ submissionId, response });
  if (!parsed.success) {
    return { success: false, error: "Write at least 100 characters and include every required response." };
  }
  const student = await currentStudent();
  if (!student) return { success: false, error: "Sign in again." };
  const submission = await db.submitAssessmentWrittenWork(
    parsed.data.submissionId,
    student.id,
    parsed.data.response
  );
  if (!submission) return { success: false, error: "This attempt can no longer be submitted." };
  revalidatePath(`/courses/${submission.courseSlug}/assessment`);
  revalidatePath("/admin");
  return { success: true };
}
