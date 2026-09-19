"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});
  return (
    <form action={action}>
      {state.error ? <div className="notice bad" role="alert">{state.error}</div> : null}
      {state.message ? <div className="notice good" role="status">{state.message}</div> : null}
      <div className="field">
        <label htmlFor="resetEmail">Email address</label>
        <input id="resetEmail" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required />
      </div>
      <button type="submit" className="btn primary lg" disabled={pending} style={{ width: "100%" }}>{pending ? "Requesting link…" : "Send reset link"}</button>
      <p className="formfoot"><Link href="/login">Back to sign in</Link></p>
      <p className="formfoot formfoot-secondary">Cannot access your email? <a href="mailto:kti@kingsword.org?subject=KTI%20password%20help">Contact the KTI team</a>.</p>
    </form>
  );
}
