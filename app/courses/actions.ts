"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import {
  findCourse,
  getCurriculum,
  isModuleReleased,
  lessonId as makeLessonId,
} from "@/lib/curriculum";
import { getLessonQuizQuestions } from "@/lib/content";
import { db } from "@/lib/db";
import { StorageUnavailableError } from "@/lib/db/types";

export async function setTopicComplete(
  courseSlug: string,
  lessonId: string,
  complete: boolean,
  path: string
): Promise<boolean> {
  const student = await currentStudent();
  if (!student) return false;

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

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasActiveAccess(enrollments, found.module.slug)) return false;

  if (complete) {
    const questions = getLessonQuizQuestions(found.module, found.course, topicNumber);
    if (questions.length && !(await db.hasPassingTopicAttempt(student.id, lessonId))) return false;
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
};

export async function recordTopicQuizAttempt(
  courseSlug: string,
  lessonId: string,
  answers: number[]
): Promise<TopicAttemptResult> {
  const parsed = topicAttemptSchema.safeParse({ courseSlug, lessonId, answers });
  if (!parsed.success) return { passed: false, pct: 0, correct: 0, total: 0, error: "Invalid attempt." };

  const student = await currentStudent();
  if (!student) return { passed: false, pct: 0, correct: 0, total: 0, error: "Sign in again." };

  const found = findCourse(parsed.data.courseSlug);
  const topicNumber = Number(parsed.data.lessonId.slice(parsed.data.courseSlug.length + 1));
  if (!found || makeLessonId(parsed.data.courseSlug, topicNumber) !== parsed.data.lessonId) {
    return { passed: false, pct: 0, correct: 0, total: 0, error: "Topic not found." };
  }
  if (!isModuleReleased(found.module)) {
    return { passed: false, pct: 0, correct: 0, total: 0, error: "This module has not opened yet." };
  }

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasActiveAccess(enrollments, found.module.slug)) {
    return { passed: false, pct: 0, correct: 0, total: 0, error: "Active enrollment required." };
  }

  const questions = getLessonQuizQuestions(found.module, found.course, topicNumber);
  if (!questions.length || questions.length !== parsed.data.answers.length) {
    return { passed: false, pct: 0, correct: 0, total: questions.length, error: "Incomplete attempt." };
  }

  const correct = questions.reduce(
    (total, question, index) => total + (question.options[parsed.data.answers[index]]?.correct ? 1 : 0),
    0
  );
  const pct = Math.round((correct / questions.length) * 100);
  const passMark = getCurriculum().grading.pass_mark;
  const passed = pct >= passMark;

  await db.createQuizAttempt({
    studentId: student.id,
    courseSlug: parsed.data.courseSlug,
    lessonId: parsed.data.lessonId,
    kind: "topic",
    correct,
    total: questions.length,
    scorePct: pct,
    passed,
    answers: parsed.data.answers,
  });

  return { passed, pct, correct, total: questions.length };
}
