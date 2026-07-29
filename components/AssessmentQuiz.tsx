"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { QuizQuestion } from "@/lib/markdown";

type AttemptQuestion = QuizQuestion & { options: QuizQuestion["options"] };
type Result = { correct: number; pct: number; passed: boolean } | null;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  const random = new Uint32Array(Math.max(1, copy.length));
  crypto.getRandomValues(random);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = random[index] % (index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export default function AssessmentQuiz({
  bank,
  courseSlug,
  passMark,
  attemptSize = 20,
}: {
  bank: QuizQuestion[];
  courseSlug: string;
  passMark: number;
  attemptSize?: number;
}) {
  const [attempt, setAttempt] = useState<AttemptQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result>(null);

  const beginAttempt = useCallback(
    (avoid: string[] = []) => {
      const avoided = new Set(avoid);
      const fresh = bank.filter((question) => !avoided.has(question.id));
      const candidates = fresh.length >= attemptSize ? fresh : bank;
      setAttempt(
        shuffled(candidates)
          .slice(0, Math.min(attemptSize, candidates.length))
          .map((question) => ({ ...question, options: shuffled(question.options) }))
      );
      setAnswers({});
      setResult(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [attemptSize, bank]
  );

  useEffect(() => {
    beginAttempt();
  }, [beginAttempt]);

  const answered = Object.keys(answers).length;
  const ready = attempt.length > 0 && answered === attempt.length;
  const storedPass = useMemo(() => `kti.assessment.${courseSlug}.passed`, [courseSlug]);

  function submit() {
    if (!ready || result) return;
    const correct = attempt.reduce(
      (total, question) => total + (question.options[answers[question.id]]?.correct ? 1 : 0),
      0
    );
    const pct = Math.round((correct / attempt.length) * 100);
    const passed = pct >= passMark;
    setResult({ correct, pct, passed });
    if (passed) {
      try {
        localStorage.setItem(storedPass, "true");
      } catch {
        // The result still displays when browser storage is unavailable.
      }
    }
  }

  if (!attempt.length) {
    return <div className="notice">Preparing a fresh assessment attempt&hellip;</div>;
  }

  return (
    <section className="quiz assessment-bank" aria-labelledby="assessment-bank-title">
      <header>
        <span className="hd" id="assessment-bank-title">
          Randomized Section A
        </span>
        <span className="score">
          {answered} of {attempt.length} answered
        </span>
      </header>

      <div className="bank-intro">
        <strong>Pass mark: {passMark}%.</strong> Each attempt draws {attempt.length} questions
        from a bank of {bank.length}. Answers are marked only after you submit the full attempt.
      </div>

      {attempt.map((question, questionIndex) => {
        const selected = answers[question.id];
        return (
          <div className="q" key={question.id}>
            <p className="stem">
              <span className="n">{questionIndex + 1}</span>
              {question.stem}
            </p>
            <div className="opts" role="group" aria-label={`Question ${questionIndex + 1}`}>
              {question.options.map((option, optionIndex) => {
                const chosen = selected === optionIndex;
                const reviewClass = result
                  ? option.correct
                    ? " right"
                    : chosen
                      ? " wrong"
                      : " dim"
                  : chosen
                    ? " selected"
                    : "";
                return (
                  <button
                    type="button"
                    className={`opt${reviewClass}`}
                    aria-pressed={chosen}
                    disabled={Boolean(result)}
                    key={`${question.id}-${optionIndex}`}
                    onClick={() =>
                      setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
                    }
                  >
                    <span className="mk">{String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option.text}</span>
                  </button>
                );
              })}
            </div>
            {result && question.explanation ? (
              <div className="why show">{question.explanation}</div>
            ) : null}
          </div>
        );
      })}

      <footer>
        {result ? (
          <button
            type="button"
            className="btn primary"
            onClick={() => beginAttempt(attempt.map((question) => question.id))}
          >
            {result.passed ? "Start another attempt" : "Try a fresh set"}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!ready} onClick={submit}>
            Submit assessment
          </button>
        )}
        <span className={`verdict${result ? (result.passed ? " pass" : " fail") : ""}`} aria-live="polite">
          {result
            ? `${result.correct} of ${attempt.length} correct (${result.pct}%). ${
                result.passed ? "Pass." : `You need ${passMark}%. Review, then try a fresh set.`
              }`
            : ready
              ? "All questions answered. Submit when you are ready."
              : `${attempt.length - answered} remaining.`}
        </span>
      </footer>
    </section>
  );
}

