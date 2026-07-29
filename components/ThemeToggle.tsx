"use client";

import { useEffect, useState } from "react";

const KEY = "kti.theme";

/** Light/dark switch. Matches the behavior of the original assets/course.js. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* storage unavailable */
    }
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      return;
    }
    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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
    <button className="themetoggle" type="button" onClick={toggle} suppressHydrationWarning>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
