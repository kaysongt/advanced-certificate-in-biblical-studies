"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { addCommunityPost, type CommunityState } from "@/app/community/[slug]/actions";

function SubmitPost() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Posting…" : "Share with the group"}
    </button>
  );
}

export default function CommunityComposer({ moduleSlug }: { moduleSlug: string }) {
  const postAction = addCommunityPost.bind(null, moduleSlug);
  const [state, formAction] = useActionState<CommunityState, FormData>(postAction, {});

  return (
    <form className="community-composer" action={formAction}>
      <label htmlFor="community-post">Add to the discussion</label>
      <textarea
        id="community-post"
        name="body"
        rows={4}
        maxLength={750}
        placeholder="Share a question, an insight, or a respectful response to another student…"
        required
      />
      <div className="community-composer-foot">
        <p>Thoughtful participation is tracked for instructor review and extra-credit opportunities.</p>
        <SubmitPost />
      </div>
      {state.error ? <p className="community-form-message error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="community-form-message success" aria-live="polite">{state.success}</p> : null}
    </form>
  );
}
