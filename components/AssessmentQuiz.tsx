"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
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
  id: string;
  status: "in-progress" | "pending-review" | "graded";
  sectionACorrect: number;
  sectionATotal: number;
  sectionAPoints: number;
  totalScore: number | null;
  feedback: string | null;
} | null;

function subscribeDraft(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function emptyDraft() {
  return "";
}

function WrittenAssessment({
  submissionId,
  writtenHtml,
}: {
  submissionId: string;
  writtenHtml: string;
}) {
  const storageKey = `kti.assessment-draft.v1.${submissionId}`;
  const savedDraft = useSyncExternalStore(
    subscribeDraft,
    () => {
      try {
        return sessionStorage.getItem(storageKey) ?? "";
      } catch {
        return "";
      }
    },
    emptyDraft,
  );
  const [edited, setEdited] = useState<string | null>(null);
  const response = edited ?? savedDraft;
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!response.trim() || submitted) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [response, submitted]);

  function saveDraft(value: string) {
    setEdited(value);
    try {
      sessionStorage.setItem(storageKey, value);
    } catch {
      setDraftAvailable(false);
    }
  }
  function submit() {
    if (pending || submitted || response.trim().length < 100) return;
    startTransition(async () => {
      try {
        const result = await submitWrittenAssessment(submissionId, response);
        if (result.success) {
          setSubmitted(true);
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* unavailable */
          }
          setMessage(
            "Submitted for instructor review. Your final result will appear after grading.",
          );
        } else
          setMessage(
            result.error ??
              "Unable to submit. Your text is still here; please try again.",
          );
      } catch {
        setMessage(
          "We couldn’t confirm your submission. Your text is still here. Check your connection and try again.",
        );
      }
    });
  }

  return (
    <section className="written-assessment">
      <div className="notice">
        Sections B and C contribute 60 points and are reviewed by an instructor.
        Respond to every prompt below in one clearly labelled submission.
      </div>
      <div
        className="prose lesson-prose"
        dangerouslySetInnerHTML={{ __html: writtenHtml }}
      />
      <div className="field assessment-response-field">
        <label htmlFor="writtenResponse">
          Your responses to Sections B and C
        </label>
        <textarea
          id="writtenResponse"
          rows={18}
          value={response}
          minLength={100}
          maxLength={30000}
          onChange={(event) => saveDraft(event.target.value)}
          disabled={pending || submitted}
          aria-describedby="written-help written-count"
        />
        <div className="hint" id="written-help">
          {draftAvailable
            ? "Drafts are saved in this browser tab. Submit your work to send it to your instructor."
            : "Browser draft storage is unavailable. Keep a separate copy until submission is confirmed."}
        </div>
        <div className="hint" id="written-count">
          {response.length.toLocaleString()} / 30,000 characters · minimum 100
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={response.trim().length < 100 || pending || submitted}
          onClick={submit}
        >
          {pending
            ? "Submitting…"
            : submitted
              ? "Submitted for review"
              : "Submit written assessment"}
        </button>
        {message ? (
          <p className="community-form-message" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default function AssessmentQuiz({
  bank,
  courseSlug,
  passMark,
  writtenHtml,
  existingSubmission,
  attemptToken,
  attemptSize = 20,
  preview = false,
}: {
  bank: PublicAssessmentQuestion[];
  courseSlug: string;
  passMark: number;
  writtenHtml: string;
  existingSubmission: ExistingSubmission;
  attemptToken: string;
  attemptSize?: number;
  preview?: boolean;
}) {
  const [attempt] = useState(() =>
    bank.slice(0, Math.min(attemptSize, bank.length)),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentAttemptResult | null>(() =>
    existingSubmission?.status === "in-progress"
      ? {
          submissionId: existingSubmission.id,
          correct: existingSubmission.sectionACorrect,
          total: existingSubmission.sectionATotal,
          sectionAPoints: existingSubmission.sectionAPoints,
          pct: Math.round(
            (existingSubmission.sectionACorrect /
              existingSubmission.sectionATotal) *
              100,
          ),
        }
      : null,
  );
  const [error, setError] = useState("");
  const [submitting, startSubmitting] = useTransition();
  if (existingSubmission?.status === "pending-review")
    return (
      <div className="notice" role="status">
        <strong>Your assessment is awaiting instructor review.</strong> Section
        A is recorded at {existingSubmission.sectionAPoints}/40. Your final
        result will appear after Sections B and C are graded.
      </div>
    );
  if (
    existingSubmission?.status === "graded" &&
    (existingSubmission.totalScore ?? 0) >= passMark
  )
    return (
      <div className="scorecard pass">
        <div className="pct">{existingSubmission.totalScore}%</div>
        <div className="detail">
          <strong>Course assessment passed</strong>
          <span>
            {existingSubmission.feedback ??
              "Your instructor has completed the review."}
          </span>
        </div>
      </div>
    );

  const answered = Object.keys(answers).length;
  const ready = attempt.length > 0 && answered === attempt.length;
  function submit() {
    if (!ready || result || submitting || preview) return;
    setError("");
    startSubmitting(async () => {
      try {
        const response = await submitAssessmentSectionA(
          courseSlug,
          attempt.map((question) => ({
            questionId: question.id,
            answer: answers[question.id],
          })),
          attemptToken,
        );
        if (response.error) setError(response.error);
        else setResult(response);
      } catch {
        setError(
          "We couldn’t save your answers. Check your connection and try again; your selections are still here.",
        );
      }
    });
  }
  if (!attempt.length && !result)
    return (
      <div className="notice">
        This assessment is not available yet. Please return to your course.
      </div>
    );
  return (
    <>
      {preview ? (
        <div className="notice">
          Staff preview · review the assessment below. No scores or student
          submissions are recorded in preview mode.
        </div>
      ) : null}
      {existingSubmission?.status === "graded" ? (
        <div className="notice bad">
          Previous result: {existingSubmission.totalScore}%.{" "}
          {existingSubmission.feedback} Start a fresh attempt below. Questions are drawn from this course’s bank, prioritizing questions not used in your previous attempt.
        </div>
      ) : null}
      {result?.submissionId ? (
        <div className="notice good" role="status">
          <strong>Section A saved: {result.sectionAPoints}/40.</strong>{" "}
          {result.correct} of {result.total} correct ({result.pct}%). Continue
          with your written responses below. You do not need to repeat Section
          A.
        </div>
      ) : (
        <section
          className="quiz assessment-bank"
          aria-labelledby="assessment-bank-title"
        >
          <header>
            <span className="hd" id="assessment-bank-title">
              Randomized Section A
            </span>
            <span className="score">
              {answered} of {attempt.length} answered
            </span>
          </header>
          <div className="bank-intro">
            <strong>Final pass mark: {passMark}%.</strong> Section A contributes
            40 points. Complete every question before submitting.
          </div>
          {attempt.map((question, questionIndex) => (
            <div className="q" key={question.id}>
              <p className="stem">
                <span className="n">{questionIndex + 1}</span>
                {question.stem}
              </p>
              <div
                className="opts"
                role="group"
                aria-label={`Question ${questionIndex + 1}`}
              >
                {question.options.map((option, optionIndex) => (
                  <button
                    type="button"
                    className={`opt${answers[question.id] === option ? " selected" : ""}`}
                    aria-pressed={answers[question.id] === option}
                    disabled={submitting}
                    key={optionIndex}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: option,
                      }))
                    }
                  >
                    <span className="mk">
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    <span>{option}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <footer>
            <button
              type="button"
              className="btn primary"
              disabled={!ready || submitting || preview}
              onClick={submit}
            >
              {preview
                ? "Preview only"
                : submitting
                  ? "Verifying…"
                  : "Submit Section A"}
            </button>
            <span
              className={`verdict${error ? " fail" : ""}`}
              aria-live="polite"
            >
              {error ||
                (ready
                  ? "All questions answered. Submit when you are ready."
                  : `${attempt.length - answered} remaining.`)}
            </span>
          </footer>
        </section>
      )}
      {preview ? (
        <section className="written-assessment">
          <h2>Written assessment prompts</h2>
          <div
            className="prose lesson-prose"
            dangerouslySetInnerHTML={{ __html: writtenHtml }}
          />
        </section>
      ) : result?.submissionId ? (
        <WrittenAssessment
          key={result.submissionId}
          submissionId={result.submissionId}
          writtenHtml={writtenHtml}
        />
      ) : null}
    </>
  );
}
