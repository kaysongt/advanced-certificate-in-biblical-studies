export default function Loading() {
  return (
    <main
      className="shell recovery-page"
      id="main-content"
      tabIndex={-1}
      aria-busy="true"
    >
      <p className="eyebrow">KingsWord Training Institute</p>
      <p className="deck" role="status">
        Loading your page…
      </p>
      <div className="loading-skeleton" aria-hidden="true" />
    </main>
  );
}
