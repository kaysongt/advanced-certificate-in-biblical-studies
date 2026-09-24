"use client";

import { useActionState, useState } from "react";
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

export default function CommunityComposer({ moduleSlug, lessonId }: { moduleSlug: string; lessonId?: string }) {
  const postAction = addCommunityPost.bind(null, moduleSlug);
  const [body, setBody] = useState("");
  const [state, formAction] = useActionState<CommunityState, FormData>(async (previous, data) => {
    try {
      const result = await postAction(previous, data);
      if (result.success) setBody("");
      return result;
    } catch {
      return { error: "We couldn’t confirm your post. Your text is still here; check the discussion before retrying." };
    }
  }, {});

  return (
    <form className="community-composer" action={formAction}>
      {lessonId ? <input type="hidden" name="lessonId" value={lessonId} /> : null}
      <label htmlFor="community-post">Add to the discussion</label>
      <textarea
        id="community-post"
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        maxLength={750}
        minLength={12}
        placeholder="Share a question, an insight, or a respectful response to another student…"
        required
      />
      <div className="community-composer-foot">
        <p>{body.length}/750 characters · Contributions are visible to this group and its instructors.</p>
        <SubmitPost />
      </div>
      {state.error ? <p className="community-form-message error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="community-form-message success" aria-live="polite">{state.success}</p> : null}
    </form>
  );
}
