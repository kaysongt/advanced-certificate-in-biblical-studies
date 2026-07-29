"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type LoginState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary lg" disabled={pending} style={{ width: "100%" }}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={action}>
      {state.error ? <div className="notice bad">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={state.email ?? ""}
          autoComplete="email"
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" />
      </div>

      <Submit />

      <p className="formfoot">
        Not enrolled yet? <Link href="/enroll">Enroll in the program</Link>
      </p>
    </form>
  );
}
