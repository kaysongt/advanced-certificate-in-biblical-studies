"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPassword } from "./actions";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, {});
  return <form action={action}>
    <input type="hidden" name="token" value={token} />
    {state.error ? <div className="notice bad" role="alert">{state.error}</div> : null}
    <div className="field">
      <label htmlFor="newPassword">New password</label>
      <input id="newPassword" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={200} aria-describedby="passwordHelp" required />
      <p className="formfoot formfoot-secondary" id="passwordHelp">At least 10 characters. Use a password you do not use elsewhere.</p>
    </div>
    <div className="field">
      <label htmlFor="confirmPassword">Confirm new password</label>
      <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={200} required />
    </div>
    <button className="btn primary lg" type="submit" disabled={pending} style={{ width: "100%" }}>{pending ? "Resetting password…" : "Reset password"}</button>
    <p className="formfoot"><Link href="/forgot-password">Request a new reset link</Link></p>
  </form>;
}
