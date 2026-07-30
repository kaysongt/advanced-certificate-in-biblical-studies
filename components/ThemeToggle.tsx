"use client";

import { useEffect, useState } from "react";

const KEY = "kti.theme";

/** Light/dark switch. Light is the intentional default presentation. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* storage unavailable */
    }
    const next = stored === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <button
      className="themetoggle theme-switch"
      type="button"
      role="switch"
      aria-checked={theme === "dark"}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      onClick={toggle}
      suppressHydrationWarning
    >
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-knob" />
      </span>
      <span className="theme-switch-label">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
