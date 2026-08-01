"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { recordTopicQuizAttempt, setTopicComplete } from "@/app/courses/actions";

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
}: Props) {
  const [complete, setComplete] = useState(alreadyComplete);
  const [passed, setPassed] = useState(alreadyComplete);
  const [pending, startTransition] = useTransition();
  const [scorePending, startScoreTransition] = useTransition();
  const [verification, setVerification] = useState("");

  // A topic with a quiz must be passed before it can be completed. Topics that
  // carry no quiz can simply be marked done.
  const canComplete = complete || !hasQuiz || !mustPass || (passed && !scorePending);
  const canAdvance = !mustPass || complete;

  function toggle() {
    const nextValue = !complete;
    startTransition(async () => {
      const saved = await setTopicComplete(courseSlug, lessonId, nextValue, path);
      if (saved) setComplete(nextValue);
    });
  }

  return (
    <>
      <LessonBody
        html={html}
        passMark={passMark}
        onScored={(_pct, _correct, _total, answers) => {
          setPassed(false);
          setVerification("Saving and verifying your result...");
          startScoreTransition(async () => {
            const result = await recordTopicQuizAttempt(courseSlug, lessonId, answers);
            setPassed(result.passed);
            setVerification(
              result.error
                ? result.error
                : result.passed
                  ? `Verified: ${result.pct}%. You can mark this topic complete.`
                  : `Verified: ${result.pct}%. Review the topic and try again.`
            );
          });
        }}
      />

      {verification ? (
        <div className={`notice${passed ? "" : " bad"}`} aria-live="polite">
          {verification}
        </div>
      ) : null}

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
