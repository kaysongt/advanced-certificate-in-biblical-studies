"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { startTimedQuiz } from "@/app/courses/timer-actions";
import { formatQuizRetryTime, type RunningQuiz } from "@/lib/timed-quiz";
import QuizCountdown from "./QuizCountdown";

import {
  recordTopicQuizAttempt,
  setTopicComplete,
} from "@/app/courses/actions";

import LessonBody from "./LessonBody";

type NavTarget = { href: string; title: string } | null;

type Props = {
  html: string;
  courseSlug: string;
  lessonId: string;
  passMark: number;
  mustPass: boolean;
  alreadyComplete: boolean;
  alreadyPassed: boolean;
  hasQuiz: boolean;
  path: string;
  prev: NavTarget;
  next: NavTarget;
  preview?: boolean;
};

export default function TopicReader({
  html,
  courseSlug,
  lessonId,
  passMark,
  mustPass,
  alreadyComplete,
  alreadyPassed,
  hasQuiz,
  path,
  prev,
  next,
  preview = false,
}: Props) {
  const [complete, setComplete] = useState(alreadyComplete);
  const [passed, setPassed] = useState(alreadyComplete || alreadyPassed);
  const [unsavedAnswers, setUnsavedAnswers] = useState<number[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [scorePending, startScoreTransition] = useTransition();
  const [verification, setVerification] = useState("");
  const [timer, setTimer] = useState<RunningQuiz | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [starting, startQuizTransition] = useTransition();
  const sections = useMemo(() => {
    const pattern = /<section class="quiz"[\s\S]*?<\/section>/g;
    return { teaching: html.replace(pattern, ""), quiz: (html.match(pattern) ?? []).join("") };
  }, [html]);
  function startQuiz() {
    startQuizTransition(async () => {
      try {
        const result = await startTimedQuiz(courseSlug, lessonId);
        if (result.id && result.deadline && result.serverNow) {
          setTimer({ id: result.id, deadline: result.deadline, serverNow: result.serverNow });
          setVerification(""); setRetryAt(null); setPassed(false);
        } else { setVerification(result.error ?? "Unable to start quiz."); setRetryAt(result.retryAt ?? null); }
      } catch { setVerification("Could not start the quiz. Check your connection and retry."); }
    });
  }

  // Missing quizzes fail closed; completion requires a verified passing attempt.
  const canComplete = complete || (hasQuiz && passed && !scorePending);
  const canAdvance = preview || !mustPass || complete;

  const handleScored = useCallback(
    (_pct: number, _correct: number, _total: number, answers: number[]) => {
      if (preview || !timer) return;
      setUnsavedAnswers(null);
      setPassed(false);
      setVerification("Saving and verifying your result…");
      startScoreTransition(async () => {
        try {
          const result = await recordTopicQuizAttempt(
            courseSlug,
            lessonId,
            answers,
            timer.id,
          );
          setPassed(result.passed);
          setTimer(null);
          setRetryAt(result.retryAt ?? null);
          setVerification(
            result.error ??
              (result.passed
                ? `Verified: ${result.pct}%. You can mark this topic complete.`
                : `Verified: ${result.pct}%. You need ${passMark}% to pass. Wait one hour before trying again.`),
          );
        } catch {
          setUnsavedAnswers(answers);
          setVerification(
            "We couldn’t verify your result. Check your connection, then select Retry saving before the timer expires.",
          );
        }
      });
    },
    [courseSlug, lessonId, preview, timer, passMark],
  );

  function toggle() {
    if (preview) return;
    const nextValue = !complete;
    startTransition(async () => {
      try {
        const saved = await setTopicComplete(
          courseSlug,
          lessonId,
          nextValue,
          path,
        );
        if (saved) {
          setComplete(nextValue);
          setVerification("");
        } else
          setVerification(
            "Your progress could not be saved. Check your sign-in and try again.",
          );
      } catch {
        setVerification(
          "We couldn’t save your progress. Check your connection and try again.",
        );
      }
    });
  }

  return (
    <>
      {preview ? (
        <div className="notice">
          Course preview · explore topics and practice quizzes without recording
          student progress.
        </div>
      ) : null}
      {!preview ? <p className="notice">Read this lesson and score at least {passMark}% on its quiz. Then select “Mark complete” below to unlock the next lesson. You can retry if you score below {passMark}%. Complete every lesson to unlock the course assessment.</p> : null}
      <LessonBody html={sections.teaching} passMark={passMark} />
      {preview ? <LessonBody html={sections.quiz} passMark={passMark} /> : <section className="timed-quiz" aria-label="Timed lesson assessment">
        <h2>Lesson assessment</h2>
        <p>You have <strong>5 minutes</strong> from selecting Start. Answer all questions before time expires and score at least <strong>{passMark}%</strong>. Time running out automatically fails the attempt. A failed or timed-out attempt requires a <strong>1-hour cooldown</strong>. Refreshing or leaving does not pause the timer.</p>
        {timer ? <>
          <QuizCountdown key={timer.id} {...timer} onExpire={() => { setTimer(null); setPassed(false); setRetryAt(timer.deadline + 60 * 60 * 1000); setVerification("Time is up. This attempt failed. Wait one hour before starting again."); }} />
          <LessonBody key={`questions-${timer.id}`} html={sections.quiz} passMark={passMark} onScored={handleScored} />
          {unsavedAnswers ? <button type="button" className="btn" disabled={scorePending} onClick={() => handleScored(0, 0, 0, unsavedAnswers)}>Retry saving result</button> : null}
        </> : !complete && !passed ? <button className="btn primary" type="button" disabled={starting || scorePending || !hasQuiz} onClick={startQuiz}>{starting ? "Starting…" : "Start / resume lesson quiz"}</button> : null}
        {retryAt ? <p className="notice bad" role="status">Next attempt available: {formatQuizRetryTime(retryAt)}.</p> : null}
      </section>}
      <div className="notice">
        Have a question or insight? <a href="#discussion">Join this lesson’s discussion</a> before you move on.
      </div>

      {verification ? (
        <div className={`notice${passed ? "" : " bad"}`} aria-live="polite">
          {verification}
        </div>
      ) : null}

      {!preview ? (
        <div className={`done-strip${complete ? " is-done" : ""}`}>
          <button
            type="button"
            className={complete ? "btn" : "btn primary"}
            onClick={toggle}
            disabled={pending || !canComplete}
          >
            {complete ? "Undo" : "Mark complete"}
          </button>
          <span className="txt">
            {complete
              ? "Topic complete."
              : canComplete
                ? "Mark this topic complete when you have finished it."
                : hasQuiz ? `Score ${passMark}% or higher on the quiz, then mark this lesson complete.` : "This lesson’s quiz is not available yet. Please contact KTI."}
          </span>
        </div>
      ) : null}

      <nav className="topicnav">
        {prev ? (
          <Link href={prev.href}>
            <span className="dir">Previous</span>
            <span className="nm">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}

        {next ? (
          canAdvance ? (
            <Link href={next.href} className="fwd">
              <span className="dir">Next</span>
              <span className="nm">{next.title}</span>
            </Link>
          ) : (
            <span className="fwd locked" aria-disabled="true">
              <span className="dir">Locked</span>
              <span className="nm">Complete this topic to continue</span>
            </span>
          )
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
