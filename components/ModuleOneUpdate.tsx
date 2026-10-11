import Link from "next/link";

export default function ModuleOneUpdate() {
  return <section className="module-update" aria-labelledby="module-update-title">
    <div className="eyebrow">Module 1 · A message from Dr. Kay</div>
    <h2 id="module-update-title">Make the most of your studies</h2>
    <p>Dr. Kay shares guidance on using the audiobooks, planning your study time, and contributing to the community.</p>
    <video controls playsInline preload="none" width={1080} height={720} poster="/assets/kti-module-1-update-2026-poster.jpg" aria-label="Dr. Kay’s Module 1 study update">
      <source src="/assets/kti-module-1-update-2026.mp4" type="video/mp4" />
      Your browser does not support this player. <a href="/assets/kti-module-1-update-2026.mp4">Open the video</a>.
    </video>
    <div className="pillrow"><Link className="btn" href="/curriculum/01-systematic-theology#module-materials-title">Find books &amp; audiobooks</Link><Link className="btn quiet" href="/community/01-systematic-theology">Share your experience</Link></div>
    <details><summary>Read the key points</summary><ul>
      <li>Use the written lessons and audio recordings together to strengthen your understanding and apply what you learn.</li>
      <li>Schedule regular study time. Aim to finish the lessons in about six weeks so you have time for review and thesis preparation.</li>
      <li>Use your progress tracker to see completed topics and where to continue.</li>
      <li>Ask questions and share your experience in the community. Staff-awarded engagement credits are tracked separately from your assessment grades.</li>
      <li>Dr. Kay mentions a forthcoming Systematic Theology video lecture. This announcement is separate from that lecture; look out for KTI’s notification when it is available.</li>
    </ul></details>
  </section>;
}
