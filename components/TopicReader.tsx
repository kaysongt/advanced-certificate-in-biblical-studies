"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";

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
  hasQuiz,
  path,
  prev,
  next,
  preview = false,
}: Props) {
  const [complete, setComplete] = useState(alreadyComplete);
  const [passed, setPassed] = useState(alreadyComplete);
  const [pending, startTransition] = useTransition();
  const [scorePending, startScoreTransition] = useTransition();
  const [verification, setVerification] = useState("");

  // A topic with a quiz must be passed before it can be completed. Topics that
  // carry no quiz can simply be marked done.
  const canComplete =
    complete || !hasQuiz || !mustPass || (passed && !scorePending);
  const canAdvance = preview || !mustPass || complete;

  const handleScored = useCallback(
    (_pct: number, _correct: number, _total: number, answers: number[]) => {
      if (preview) return;
      setPassed(false);
      setVerification("Saving and verifying your result…");
      startScoreTransition(async () => {
        try {
          const result = await recordTopicQuizAttempt(
            courseSlug,
            lessonId,
            answers,
          );
          setPassed(result.passed);
          setVerification(
            result.error ??
              (result.passed
                ? `Verified: ${result.pct}%. You can mark this topic complete.`
                : `Verified: ${result.pct}%. Review the topic and try again.`),
          );
        } catch {
          setVerification(
            "We couldn’t verify your result. Check your connection, then retry the quiz.",
          );
        }
      });
    },
    [courseSlug, lessonId, preview],
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
          Staff preview · explore topics and practice quizzes without recording
          student progress.
        </div>
      ) : null}
      <LessonBody html={html} passMark={passMark} onScored={handleScored} />
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
                : `Pass the quiz at ${passMark}% to complete this topic.`}
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
