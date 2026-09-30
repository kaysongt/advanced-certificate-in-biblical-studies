"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasStudyAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { canPreviewCourses } from "@/lib/course-preview";
import {
  findCourse,
  getCurriculum,
  isModuleReleased,
  lessonId as makeLessonId,
} from "@/lib/curriculum";
import { getLessonQuizQuestions, getLessonRows } from "@/lib/content";
import { db } from "@/lib/db";
import { StorageUnavailableError } from "@/lib/db/types";
import { meetsPassMark } from "@/lib/learning-progress";
import { quizTimeExpired, quizRetryAt } from "@/lib/timed-quiz";

export async function setTopicComplete(
  courseSlug: string,
  lessonId: string,
  complete: boolean,
  path: string,
): Promise<boolean> {
  const student = await currentStudent();
  if (!student || canPreviewCourses(student)) return false;

  const found = findCourse(courseSlug);
  const topicNumber = Number(lessonId.slice(courseSlug.length + 1));
  if (
    !found ||
    !Number.isInteger(topicNumber) ||
    makeLessonId(courseSlug, topicNumber) !== lessonId
  ) {
    return false;
  }
  if (!isModuleReleased(found.module)) return false;
  const rows = getLessonRows(found.module, found.course);
  if (!rows.some((row) => row.id === lessonId)) return false;

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasStudyAccess(student, enrollments, found.module.slug)) return false;

  if (complete) {
    if (getCurriculum().grading.must_pass_to_advance) {
      const done = new Set(
        (await db.getProgress(student.id)).map((item) => item.lessonId),
      );
      if (rows.some((row) => row.n < topicNumber && !done.has(row.id)))
        return false;
    }
    const questions = getLessonQuizQuestions(
      found.module,
      found.course,
      topicNumber,
    );
    if (!questions.length || !(await db.hasPassingTopicAttempt(student.id, lessonId)))
      return false;
  }

  try {
    if (complete) await db.markLessonComplete(student.id, lessonId);
    else await db.clearLessonComplete(student.id, lessonId);
  } catch (err) {
    // Progress is not worth a hard failure — the client already shows the
    // topic as complete. It will not survive a reload until storage exists.
    if (err instanceof StorageUnavailableError) return false;
    throw err;
  }

  const expectedPath = `/courses/${courseSlug}/${topicNumber}`;
  revalidatePath(path === expectedPath ? path : expectedPath);
  return true;
}

const topicAttemptSchema = z.object({
  courseSlug: z.string().min(1).max(40),
  lessonId: z.string().min(1).max(60),
  answers: z.array(z.number().int().min(0).max(10)).min(1).max(100),
});

export type TopicAttemptResult = {
  passed: boolean;
  pct: number;
  correct: number;
  total: number;
  error?: string;
  retryAt?: number;
};

export async function recordTopicQuizAttempt(
  courseSlug: string,
  lessonId: string,
  answers: number[],
  timedAttemptId: string,
): Promise<TopicAttemptResult> {
  const parsed = topicAttemptSchema.safeParse({
    courseSlug,
    lessonId,
    answers,
  });
  if (!parsed.success)
    return {
      passed: false,
      pct: 0,
      correct: 0,
      total: 0,
      error: "Invalid attempt.",
    };

  const student = await currentStudent();
  if (!student)
    return {
      passed: false,
      pct: 0,
      correct: 0,
      total: 0,
      error: "Sign in again.",
    };

  if (canPreviewCourses(student))
    return { passed: false, pct: 0, correct: 0, total: 0, error: "Preview does not record student progress." };

  const found = findCourse(parsed.data.courseSlug);
  const topicNumber = Number(
    parsed.data.lessonId.slice(parsed.data.courseSlug.length + 1),
  );
  if (
    !found ||
    makeLessonId(parsed.data.courseSlug, topicNumber) !== parsed.data.lessonId
  ) {
    return {
      passed: false,
      pct: 0,
      correct: 0,
      total: 0,
      error: "Topic not found.",
    };
  }
  if (!isModuleReleased(found.module)) {
    return {
      passed: false,
      pct: 0,
      correct: 0,
      total: 0,
      error: "This module has not opened yet.",
    };
  }

  const rows = getLessonRows(found.module, found.course);
  if (
    !Number.isInteger(topicNumber) ||
    !rows.some((row) => row.id === parsed.data.lessonId)
  ) {
    return {
      passed: false,
      pct: 0,
      correct: 0,
      total: 0,
      error: "Topic not found.",
    };
  }

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasStudyAccess(student, enrollments, found.module.slug)) {
    return {
      passed: false,
      pct: 0,
      correct: 0,
      total: 0,
      error: "Active enrollment required.",
    };
  }

  const questions = getLessonQuizQuestions(
    found.module,
    found.course,
    topicNumber,
  );
  if (getCurriculum().grading.must_pass_to_advance) {
    const done = new Set(
      (await db.getProgress(student.id)).map((item) => item.lessonId),
    );
    if (rows.some((row) => row.n < topicNumber && !done.has(row.id))) {
      return {
        passed: false,
        pct: 0,
        correct: 0,
        total: questions.length,
        error: "Complete the earlier topics first.",
      };
    }
  }
  if (!questions.length || questions.length !== parsed.data.answers.length) {
    return {
      passed: false,
      pct: 0,
      correct: 0,
      total: questions.length,
      error: "Incomplete attempt.",
    };
  }

  const correct = questions.reduce(
    (total, question, index) =>
      total + (question.options[parsed.data.answers[index]]?.correct ? 1 : 0),
    0,
  );
  const pct = Math.round((correct / questions.length) * 100);
  const passMark = getCurriculum().grading.pass_mark;
  const passed = meetsPassMark(correct, questions.length, passMark);

  const timed = typeof timedAttemptId === "string" ? await db.getTimedQuiz(timedAttemptId, student.id) : null;
  if (!timed || timed.courseSlug !== courseSlug || timed.lessonId !== lessonId || timed.timer.state !== "started")
    return { passed: false, pct: 0, correct: 0, total: questions.length, error: "Start a new quiz attempt before submitting." };
  if (quizTimeExpired(timed.timer.deadline))
    return { passed: false, pct: 0, correct: 0, total: questions.length, error: "Time is up. This attempt failed. Wait one hour before trying again.", retryAt: quizRetryAt(timed) };
  const saved = await db.finishTimedQuiz({
    id: timed.id,
    studentId: student.id,
    correct,
    total: questions.length,
    scorePct: pct,
    passed,
    answers: parsed.data.answers,
  });
  if (saved.status !== "saved") return { passed: false, pct: 0, correct: 0, total: questions.length, error: saved.status === "expired" ? "Time is up. This attempt failed. Wait one hour before trying again." : "This attempt has already been submitted." };
  return { passed, pct, correct, total: questions.length, retryAt: passed ? undefined : Date.now() + 60 * 60 * 1000 };
}
