"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ThesisActionForm({ action, children, label }: {
  action: (form: FormData) => Promise<{ message: string }>; children: React.ReactNode; label: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <form className="thesis-form" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      try { setMessage((await action(form)).message); router.refresh(); }
      catch { setMessage("Unable to save. Your text is still here. Check your connection and try again."); }
    });
  }}>
    <fieldset disabled={pending} style={{ border: 0, padding: 0, minWidth: 0 }}>
      {children}
      <button type="submit" className="btn primary">{pending ? "Working…" : label}</button>
    </fieldset>
    {message ? <p role="status" className="notice">{message}</p> : null}
  </form>;
}
