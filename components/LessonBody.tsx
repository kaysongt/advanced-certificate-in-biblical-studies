"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Renders a topic's teaching material and wires up its quiz.
 *
 * The teaching lives on this page — it is the lesson itself, not a summary of
 * reading done elsewhere. The quiz gates completion: a student cannot mark the
 * topic complete, or move to the next one, without reaching the pass mark.
 */

type Props = {
  html: string;
  passMark: number;
  assessment?: boolean;
  /** Called when the quiz is fully answered, with the score as a percentage. */
  onScored?: (pct: number, correct: number, total: number, answers: number[]) => void;
};

export type QuizResult = { correct: number; total: number; pct: number } | null;

export default function LessonBody({ html, passMark, assessment = false, onScored }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<QuizResult>(null);

  const report = useCallback(
    (correct: number, total: number, answers: number[]) => {
      const pct = total ? Math.round((correct / total) * 100) : 0;
      setResult({ correct, total, pct });
      onScored?.(pct, correct, total, answers);
    },
    [onScored]
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const cleanups: (() => void)[] = [];

    root.querySelectorAll<HTMLElement>(".quiz").forEach((quiz) => {
      const questions = Array.from(quiz.querySelectorAll<HTMLElement>(".q"));
      const total = questions.length;
      const scoreEl = quiz.querySelector<HTMLElement>(".score");
      const verdictEl = quiz.querySelector<HTMLElement>(".verdict");
      const resetBtn = quiz.querySelector<HTMLButtonElement>(".reset");
      let answered = 0;
      let correct = 0;
      const selectedAnswers = Array<number>(total).fill(-1);

      const paint = () => {
        if (scoreEl) scoreEl.textContent = `${answered} of ${total} answered`;
        if (answered === total && verdictEl) {
          const pct = Math.round((correct / total) * 100);
          const passed = pct >= passMark;
          verdictEl.textContent = assessment
            ? `${correct} of ${total} correct (${pct}%). Section A complete; Sections B and C are instructor-marked.`
            : `${correct} of ${total} correct (${pct}%). ` +
              (passed ? "Pass." : `You need ${passMark}% to continue. Review and try again.`);
          verdictEl.className = assessment ? "verdict" : `verdict ${passed ? "pass" : "fail"}`;
          report(correct, total, selectedAnswers);
        }
      };

      questions.forEach((q, questionIndex) => {
        const opts = Array.from(q.querySelectorAll<HTMLButtonElement>(".opt"));
        const why = q.querySelector<HTMLElement>(".why");
        opts.forEach((opt) => {
          const onClick = () => {
            if (q.getAttribute("data-done")) return;
            q.setAttribute("data-done", "1");
            answered += 1;
            selectedAnswers[questionIndex] = opts.indexOf(opt);
            if (opt.getAttribute("data-correct") === "1") correct += 1;
            opts.forEach((o) => {
              o.disabled = true;
              if (o.getAttribute("data-correct") === "1") o.classList.add("right");
              else if (o === opt) o.classList.add("wrong");
              else o.classList.add("dim");
            });
            why?.classList.add("show");
            paint();
          };
          opt.addEventListener("click", onClick);
          cleanups.push(() => opt.removeEventListener("click", onClick));
        });
      });

      if (resetBtn) {
        const onReset = () => {
          answered = 0;
          correct = 0;
          selectedAnswers.fill(-1);
          setResult(null);
          questions.forEach((q) => {
            q.removeAttribute("data-done");
            q.querySelector(".why")?.classList.remove("show");
            q.querySelectorAll<HTMLButtonElement>(".opt").forEach((o) => {
              o.disabled = false;
              o.classList.remove("right", "wrong", "dim");
            });
          });
          if (verdictEl) {
            verdictEl.textContent = "";
            verdictEl.className = "verdict";
          }
          paint();
        };
        resetBtn.addEventListener("click", onReset);
        cleanups.push(() => resetBtn.removeEventListener("click", onReset));
      }

      paint();
    });

    return () => cleanups.forEach((fn) => fn());
  }, [assessment, html, passMark, report]);

  return (
    <>
      <div className="prose lesson-prose" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      {result ? (
        <div className={`scorecard${assessment ? "" : result.pct >= passMark ? " pass" : " fail"}`}>
          <div className="pct">{result.pct}%</div>
          <div className="detail">
            <strong>
              {result.correct} of {result.total} correct
            </strong>
            <span>
              {assessment
                ? "Section A is complete. Your instructor will combine it with Sections B and C for your final result."
                : result.pct >= passMark
                ? "You have passed this topic. You can move on."
                : `Pass mark is ${passMark}%. Retake the quiz before moving on.`}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
