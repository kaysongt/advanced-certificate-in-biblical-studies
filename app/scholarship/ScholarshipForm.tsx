"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  submitScholarshipApplication,
  type ScholarshipFormState,
} from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary lg" type="submit" disabled={pending}>
      {pending ? "Submitting application…" : "Submit scholarship application"}
    </button>
  );
}

export default function ScholarshipForm({
  enrollmentId,
  tuition,
}: {
  enrollmentId: string;
  tuition: number;
}) {
  const [state, action] = useActionState<ScholarshipFormState, FormData>(
    submitScholarshipApplication,
    {}
  );
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={action} className="scholarship-form">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      {state.error ? <div className="notice bad">{state.error}</div> : null}

      <div className={`field${errors.financialNeed ? " err" : ""}`}>
        <label htmlFor="financialNeed">Tell us about your financial need</label>
        <textarea
          id="financialNeed"
          name="financialNeed"
          rows={6}
          minLength={40}
          maxLength={3000}
          defaultValue={values.financialNeed ?? ""}
          aria-describedby="financialNeed-hint"
          required
        />
        <div className="hint" id="financialNeed-hint">
          Briefly explain why the tuition is not currently affordable for you.
        </div>
        {errors.financialNeed ? <div className="msg">{errors.financialNeed}</div> : null}
      </div>

      <div className={`field${errors.trainingGoals ? " err" : ""}`}>
        <label htmlFor="trainingGoals">How will you use this training?</label>
        <textarea
          id="trainingGoals"
          name="trainingGoals"
          rows={6}
          minLength={40}
          maxLength={3000}
          defaultValue={values.trainingGoals ?? ""}
          aria-describedby="trainingGoals-hint"
          required
        />
        <div className="hint" id="trainingGoals-hint">
          Share how the program will support your spiritual growth, ministry, or service.
        </div>
        {errors.trainingGoals ? <div className="msg">{errors.trainingGoals}</div> : null}
      </div>

      <div className={`field scholarship-contribution${errors.amountAbleToPay ? " err" : ""}`}>
        <label htmlFor="amountAbleToPay">Amount you could contribute (USD)</label>
        <div className="currency-input">
          <span aria-hidden="true">$</span>
          <input
            id="amountAbleToPay"
            name="amountAbleToPay"
            type="number"
            min="0"
            max={tuition}
            step="1"
            inputMode="numeric"
            defaultValue={values.amountAbleToPay ?? "0"}
            required
          />
        </div>
        <div className="hint">Enter 0 if you cannot contribute toward tuition.</div>
        {errors.amountAbleToPay ? <div className="msg">{errors.amountAbleToPay}</div> : null}
      </div>

      <div className="form-trap" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className={`field consent-field${errors.informationAccurate ? " err" : ""}`}>
        <label className="consent-row" htmlFor="informationAccurate">
          <input
            id="informationAccurate"
            name="informationAccurate"
            type="checkbox"
            value="yes"
            defaultChecked={values.informationAccurate === "yes"}
            required
          />
          <span>
            I confirm that this information is accurate and understand that submitting an
            application does not guarantee an award.
          </span>
        </label>
        {errors.informationAccurate ? (
          <div className="msg">{errors.informationAccurate}</div>
        ) : null}
      </div>

      <div className="scholarship-form-actions">
        <SubmitButton />
        <Link className="btn quiet lg" href="/dashboard">
          Return to payment options
        </Link>
      </div>
    </form>
  );
}
