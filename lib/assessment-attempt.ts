import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./auth-core";

export const ASSESSMENT_SIZE = 20;
type IssuedAttempt = {
  studentId: string;
  courseSlug: string;
  questionIds: string[];
  expires: number;
};

/** Bind grading to the exact questions issued by the server, not a chosen subset. */
export function issueAssessmentAttempt(
  studentId: string,
  courseSlug: string,
  questionIds: string[],
): string {
  const payload = Buffer.from(
    JSON.stringify({
      studentId,
      courseSlug,
      questionIds,
      expires: Date.now() + 24 * 60 * 60 * 1000,
    } satisfies IssuedAttempt),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", sessionSecret()).update(payload).digest("base64url")}`;
}

export function verifyAssessmentAttempt(
  token: string,
  studentId: string,
  courseSlug: string,
  questionIds: string[],
): boolean {
  try {
    if (token.length > 12000) return false;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;
    const expected = createHmac("sha256", sessionSecret())
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return false;
    const issued: IssuedAttempt = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    return (
      issued.studentId === studentId &&
      issued.courseSlug === courseSlug &&
      issued.expires > Date.now() &&
      Array.isArray(issued.questionIds) &&
      issued.questionIds.length === questionIds.length &&
      new Set(questionIds).size === questionIds.length &&
      issued.questionIds.every((id, i) => id === questionIds[i])
    );
  } catch {
    return false;
  }
}
