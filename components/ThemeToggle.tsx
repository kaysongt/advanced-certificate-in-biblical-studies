"use client";

import { useSyncExternalStore } from "react";

const KEY = "kti.theme";
const EVENT = "kti-theme-change";
type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Light/dark switch. The pre-hydration script applies the stored theme. */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event(EVENT));
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
