"use client";

import { useState, useTransition } from "react";

import {
  submitAssessmentSectionA,
  submitWrittenAssessment,
  type AssessmentAttemptResult,
} from "@/app/courses/[slug]/assessment/actions";

export type PublicAssessmentQuestion = {
  id: string;
  stem: string;
  options: string[];
};

type ExistingSubmission = {
  status: "in-progress" | "pending-review" | "graded";
  sectionAPoints: number;
  totalScore: number | null;
  feedback: string | null;
} | null;

export default function AssessmentQuiz({
  bank,
  courseSlug,
  passMark,
  writtenHtml,
  existingSubmission,
  attemptSize = 20,
}: {
  bank: PublicAssessmentQuestion[];
  courseSlug: string;
  passMark: number;
  writtenHtml: string;
  existingSubmission: ExistingSubmission;
  attemptSize?: number;
}) {
  const [attempt] = useState<PublicAssessmentQuestion[]>(() =>
    bank.slice(0, Math.min(attemptSize, bank.length))
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentAttemptResult | null>(null);
  const [writtenResponse, setWrittenResponse] = useState("");
  const [writtenMessage, setWrittenMessage] = useState("");
  const [submitting, startSubmitting] = useTransition();
  const [submittingWritten, startSubmittingWritten] = useTransition();

  if (existingSubmission?.status === "pending-review") {
    return (
      <div className="notice">
        <strong>Your assessment is awaiting instructor review.</strong> Section A is recorded at{" "}
        {existingSubmission.sectionAPoints}/40. Your final result will appear after Sections B and C are graded.
      </div>
    );
  }

  if (
    existingSubmission?.status === "graded" &&
    existingSubmission.totalScore !== null &&
    existingSubmission.totalScore >= passMark
  ) {
    return (
      <div className="scorecard pass">
        <div className="pct">{existingSubmission.totalScore}%</div>
        <div className="detail">
          <strong>Course assessment passed</strong>
          <span>{existingSubmission.feedback ?? "Your instructor has completed the review."}</span>
        </div>
      </div>
    );
  }

  const answered = Object.keys(answers).length;
  const ready = attempt.length > 0 && answered === attempt.length;

  function submit() {
    if (!ready || result || submitting) return;
    startSubmitting(async () => {
      const response = await submitAssessmentSectionA(
        courseSlug,
        attempt.map((question) => ({ questionId: question.id, answer: answers[question.id] }))
      );
      setResult(response);
    });
  }

  function submitWritten() {
    if (!result?.submissionId || submittingWritten) return;
    startSubmittingWritten(async () => {
      const response = await submitWrittenAssessment(result.submissionId!, writtenResponse);
      setWrittenMessage(
        response.success
          ? "Submitted for instructor review. Your final result will appear after grading."
          : response.error ?? "Unable to submit your written work."
      );
    });
  }

  if (!attempt.length) return <div className="notice">Preparing a fresh assessment attempt...</div>;

  return (
    <>
      {existingSubmission?.status === "graded" && existingSubmission.totalScore !== null ? (
        <div className="notice bad">
          Previous result: {existingSubmission.totalScore}%. {existingSubmission.feedback} Start a fresh attempt below.
        </div>
      ) : null}

      <section className="quiz assessment-bank" aria-labelledby="assessment-bank-title">
        <header>
          <span className="hd" id="assessment-bank-title">Randomized Section A</span>
          <span className="score">{answered} of {attempt.length} answered</span>
        </header>

        <div className="bank-intro">
          <strong>Final pass mark: {passMark}%.</strong> Section A contributes 40 points. Answers are
          verified and recorded on the server after the complete attempt is submitted.
        </div>

        {attempt.map((question, questionIndex) => (
          <div className="q" key={question.id}>
            <p className="stem"><span className="n">{questionIndex + 1}</span>{question.stem}</p>
            <div className="opts" role="group" aria-label={`Question ${questionIndex + 1}`}>
              {question.options.map((option, optionIndex) => {
                const chosen = answers[question.id] === option;
                return (
                  <button
                    type="button"
                    className={`opt${chosen ? " selected" : ""}`}
                    aria-pressed={chosen}
                    disabled={Boolean(result) || submitting}
                    key={`${question.id}-${optionIndex}`}
                    onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                  >
                    <span className="mk">{String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <footer>
          <button type="button" className="btn primary" disabled={!ready || submitting || Boolean(result)} onClick={submit}>
            {submitting ? "Verifying..." : "Submit Section A"}
          </button>
          <span className={`verdict${result?.error ? " fail" : result ? " pass" : ""}`} aria-live="polite">
            {result?.error
              ? result.error
              : result
                ? `${result.correct} of ${result.total} correct (${result.pct}%). Section A: ${result.sectionAPoints}/40.`
                : ready
                  ? "All questions answered. Submit when you are ready."
                  : `${attempt.length - answered} remaining.`}
          </span>
        </footer>
      </section>

      {result?.submissionId ? (
        <section className="written-assessment">
          <div className="notice">
            Sections B and C contribute 60 points and are reviewed by an instructor. Respond to every
            prompt below in one clearly labelled submission.
          </div>
          <div className="prose lesson-prose" dangerouslySetInnerHTML={{ __html: writtenHtml }} />
          <div className="field assessment-response-field">
            <label htmlFor="writtenResponse">Your responses to Sections B and C</label>
            <textarea
              id="writtenResponse"
              rows={18}
              value={writtenResponse}
              minLength={100}
              maxLength={30000}
              onChange={(event) => setWrittenResponse(event.target.value)}
              disabled={submittingWritten || writtenMessage.startsWith("Submitted")}
            />
            <div className="hint">Label each answer clearly. Your work is saved when you submit it.</div>
            <button
              type="button"
              className="btn primary"
              disabled={writtenResponse.trim().length < 100 || submittingWritten || writtenMessage.startsWith("Submitted")}
              onClick={submitWritten}
            >
              {submittingWritten ? "Submitting..." : "Submit written assessment"}
            </button>
            {writtenMessage ? <p className="community-form-message" aria-live="polite">{writtenMessage}</p> : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
