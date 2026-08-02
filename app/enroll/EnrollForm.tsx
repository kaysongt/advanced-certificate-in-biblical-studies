"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { registerStudent, type FormState } from "./actions";

const COUNTRIES = [
  "Nigeria",
  "United States",
  "United Kingdom",
  "Canada",
  "Ghana",
  "South Africa",
  "Kenya",
  "Other",
];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary lg" disabled={pending} style={{ width: "100%" }}>
      {pending ? "Creating your account…" : label}
    </button>
  );
}

type ModuleOption = { slug: string; title: string; available: boolean; availability?: string };

export default function EnrollForm({
  initialPlan,
  modules,
}: {
  initialPlan: "certificate" | "advanced";
  modules: ModuleOption[];
}) {
  const [state, action] = useActionState<FormState, FormData>(registerStudent, {});
  const [plan, setPlan] = useState(initialPlan);

  const err = state.fieldErrors ?? {};
  const val = state.values ?? {};
  const certificateAvailable = modules.some((module) => module.available);
  const firstReleaseDate = modules[0]?.availability;

  return (
    <form action={action}>
      {state.error ? <div className="notice bad">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="plan">What are you enrolling in?</label>
        <select
          id="plan"
          name="plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value as "certificate" | "advanced")}
        >
          <option value="advanced">Advanced Certificate - all five programs ($1,000)</option>
          <option value="certificate" disabled={!certificateAvailable}>
            A single certificate ($250)
            {certificateAvailable ? "" : ` - opens ${firstReleaseDate ?? "later"}`}
          </option>
        </select>
      </div>

      {plan === "certificate" ? (
        <div className={`field${err.product ? " err" : ""}`}>
          <label htmlFor="product">Which certificate?</label>
          <select id="product" name="product" defaultValue={val.product ?? ""} required>
            <option value="">Select a certificate…</option>
            {modules.map((m) => (
              <option key={m.slug} value={m.slug} disabled={!m.available}>
                {m.title}
                {m.available ? "" : ` (Opens ${m.availability ?? "later"})`}
              </option>
            ))}
          </select>
          {err.product ? <div className="msg">{err.product}</div> : null}
        </div>
      ) : null}

      <div className={`field${err.fullName ? " err" : ""}`}>
        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          name="fullName"
          defaultValue={val.fullName ?? ""}
          autoComplete="name"
          minLength={2}
          maxLength={100}
          required
        />
        {err.fullName ? <div className="msg">{err.fullName}</div> : null}
      </div>

      <div className={`field${err.email ? " err" : ""}`}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={val.email ?? ""}
          autoComplete="email"
          maxLength={254}
          required
        />
        {err.email ? <div className="msg">{err.email}</div> : null}
      </div>

      <div className={`field${err.country ? " err" : ""}`}>
        <label htmlFor="country">Country</label>
        <select id="country" name="country" defaultValue={val.country ?? ""} required>
          <option value="">Select your country…</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {err.country ? <div className="msg">{err.country}</div> : null}
      </div>

      <div className={`field${err.password ? " err" : ""}`}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={200}
          required
        />
        <div className="hint">At least 10 characters.</div>
        {err.password ? <div className="msg">{err.password}</div> : null}
      </div>

      <div className="form-trap" aria-hidden="true">
        <label htmlFor="website" aria-hidden="true">
          Website
        </label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
      </div>

      <div className={`field consent-field${err.privacyAccepted ? " err" : ""}`}>
        <label className="consent-row" htmlFor="privacyAccepted">
          <input
            id="privacyAccepted"
            name="privacyAccepted"
            type="checkbox"
            value="yes"
            required
            defaultChecked={val.privacyAccepted === "yes"}
          />
          <span>
            I have read the <Link href="/privacy">privacy notice</Link> and understand how my
            registration and learning records are used.
          </span>
        </label>
        {err.privacyAccepted ? <div className="msg">{err.privacyAccepted}</div> : null}
      </div>

      <Submit label="Create my account" />

      <p className="formfoot">
        Already enrolled? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
