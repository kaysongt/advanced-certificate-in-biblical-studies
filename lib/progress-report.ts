import type { LearningActivity } from "./db/types";

export type ReportCourse = { slug: string; title: string; moduleSlug: string; lessonIds: string[] };

export function indexLearningActivity(activity: LearningActivity) {
  const result = new Map<string, LearningActivity>();
  const get = (id: string) => {
    if (!result.has(id)) result.set(id, { progress: [], quizzes: [], assessments: [], posts: [] });
    return result.get(id)!;
  };
  for (const row of activity.progress) get(row.studentId).progress.push(row);
  for (const row of activity.quizzes) get(row.studentId).quizzes.push(row);
  for (const row of activity.assessments) get(row.studentId).assessments.push(row);
  for (const row of activity.posts) get(row.studentId).posts.push(row);
  return result;
}

export function summarizeLearning(activity: LearningActivity | undefined, courses: ReportCourse[], now = Date.now()) {
  const ids = new Set(courses.flatMap((course) => course.lessonIds));
  const slugs = new Set(courses.map((course) => course.slug));
  const modules = new Set(courses.map((course) => course.moduleSlug));
  const completed = new Map((activity?.progress ?? []).filter((row) => ids.has(row.lessonId)).map((row) => [row.lessonId, row.completedAt]));
  const quizzes = (activity?.quizzes ?? []).filter((row) => slugs.has(row.courseSlug)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const scored = quizzes.filter((row) => row.state !== "in-progress");
  const latestQuizzes = new Map<string, LearningActivity["quizzes"][number]>();
  for (const row of quizzes) {
    const key = row.lessonId ?? row.courseSlug;
    if (!latestQuizzes.has(key)) latestQuizzes.set(key, row);
  }
  const assessments = (activity?.assessments ?? []).filter((row) => slugs.has(row.courseSlug)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestAssessments = new Map<string, LearningActivity["assessments"][number]>();
  for (const row of assessments) if (!latestAssessments.has(row.courseSlug)) latestAssessments.set(row.courseSlug, row);
  const posts = (activity?.posts ?? []).filter((row) => modules.has(row.moduleSlug));
  const times = [...completed.values(), ...quizzes.map((row) => row.activityAt), ...assessments.map((row) => row.createdAt), ...posts.map((row) => row.createdAt)];
  const lastActivity = times.sort().at(-1) ?? null;
  return {
    completed, quizzes, latestQuizzes, latestAssessments,
    totalLessons: ids.size,
    percent: ids.size ? Math.round(completed.size / ids.size * 100) : 0,
    posts: posts.length,
    credits: posts.reduce((sum, row) => sum + row.engagementCredits, 0),
    attempts: scored.length,
    averageScore: scored.length ? Math.round(scored.reduce((sum, row) => sum + row.scorePct, 0) / scored.length) : null,
    passedCourses: [...latestAssessments.values()].filter((row) => row.status === "graded" && (row.totalScore ?? 0) >= 80).length,
    needsRetry: [...latestQuizzes.values()].filter((row) => row.state !== "in-progress" && !row.passed).length,
    lastActivity,
    activeThisWeek: lastActivity !== null && Date.parse(lastActivity) >= now - 7 * 86400000,
  };
}
