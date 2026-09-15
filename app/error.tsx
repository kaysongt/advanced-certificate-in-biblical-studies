"use client";

import Link from "next/link";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="shell recovery-page" id="main-content" tabIndex={-1}>
      <div className="eyebrow">A temporary interruption</div>
      <h1>We couldn’t load this page.</h1>
      <p className="deck">
        Please try again. If you were submitting work or making a payment, check
        your dashboard before repeating the action.
      </p>
      <div className="recovery-actions">
        <button className="btn primary lg" onClick={retry}>
          Try again
        </button>
        <Link className="btn quiet lg" href="/dashboard">
          My studies
        </Link>
      </div>
      <p className="formfoot">
        Still having trouble?{" "}
        <a href="mailto:kti@kingsword.org">Contact the KTI team</a>
      </p>
    </main>
  );
}
