"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "kti.student-walkthrough.v1";
const STEPS = [
  { target: "[data-tour='access']", title: "Your access", body: "Module 1 is open to registered students. This panel explains what is available now and what payment or approval is needed for later modules." },
  { target: "[data-tour='module']", title: "Start Module 1", body: "Open Systematic Theology here. Work through each lesson in order and use the textbook, PDF, and audio resources." },
  { target: "[data-tour='welcome']", title: "Watch the welcome", body: "Dr. Kay’s welcome video explains the certificate and how to get started. Press play whenever you are ready." },
  { target: "[data-tour='community']", title: "Learn together", body: "Use the community groups to ask questions and share reflections with your classmates and instructors." },
];

export default function StudentWalkthrough() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const close = useCallback(() => { setOpen(false); window.localStorage.setItem(STORAGE_KEY, "complete"); }, []);
  const locate = useCallback(() => { if (!open) return; const element = document.querySelector(STEPS[step].target); setRect(element?.getBoundingClientRect() ?? null); element?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [open, step]);
  useEffect(() => { if (window.localStorage.getItem(STORAGE_KEY) !== "complete") setOpen(true); }, []);
  useEffect(() => { locate(); if (!open) return; const update = () => locate(); window.addEventListener("resize", update); window.addEventListener("scroll", update, { passive: true }); return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update); }; }, [locate, open]);
  if (!open) return <button className="walkthrough-replay" type="button" onClick={() => { setStep(0); setOpen(true); }}>Show walkthrough again</button>;
  const current = STEPS[step];
  return <div className="walkthrough-layer" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title"><div className="walkthrough-dim" onClick={close} />{rect ? <div className="walkthrough-focus" style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }} /> : null}<section className="walkthrough-card"><div className="walkthrough-progress">Step {step + 1} of {STEPS.length}</div><h2 id="walkthrough-title">{current.title}</h2><p>{current.body}</p><div className="walkthrough-actions"><button type="button" className="btn quiet" onClick={close}>Skip tour</button>{step > 0 ? <button type="button" className="btn" onClick={() => setStep(step - 1)}>Back</button> : null}<button type="button" className="btn primary" onClick={() => step === STEPS.length - 1 ? close() : setStep(step + 1)}>{step === STEPS.length - 1 ? "Finish" : "Next"}</button></div></section></div>;
}
