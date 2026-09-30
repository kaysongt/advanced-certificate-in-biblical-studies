"use client";

import { useEffect, useRef, useState } from "react";

export default function QuizCountdown({ deadline, serverNow, onExpire }: { deadline: number; serverNow: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((deadline - serverNow) / 1000)));
  const expire = useRef(onExpire);
  useEffect(() => { expire.current = onExpire; }, [onExpire]);
  useEffect(() => {
    const start = performance.now();
    let fired = false;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - serverNow - (performance.now() - start)) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !fired) { fired = true; expire.current(); }
    };
    const timer = setInterval(tick, 250);
    tick();
    return () => clearInterval(timer);
  }, [deadline, serverNow]);
  return <p className={`notice${remaining <= 60 ? " bad" : ""}`} role="timer" aria-label="Assessment time remaining"><strong>Time remaining: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong> · The timer cannot be paused. Submit before it reaches zero.</p>;
}
