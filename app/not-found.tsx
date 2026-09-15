import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell recovery-page" id="main-content" tabIndex={-1}>
      <div className="eyebrow">Page not found · 404</div>
      <h1>Let’s get you back on course.</h1>
      <p className="deck">
        This page may have moved, or the link may be incomplete. Your studies
        are still available from your dashboard.
      </p>
      <div className="recovery-actions">
        <Link className="btn primary lg" href="/dashboard">
          My studies
        </Link>
        <Link className="btn quiet lg" href="/curriculum">
          Explore the curriculum
        </Link>
      </div>
      <p className="formfoot">
        Need help? <a href="mailto:kti@kingsword.org">Contact the KTI team</a>
      </p>
    </main>
  );
}
