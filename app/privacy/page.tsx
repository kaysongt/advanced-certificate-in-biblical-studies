import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How KingsWord Training Institute handles registration and learning data.",
};

export default function PrivacyPage() {
  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">Your information</div>
        <h1>Privacy notice</h1>
        <p className="deck">
          This notice explains what the KingsWord Training Institute website records and how
          that information supports enrollment and study.
        </p>
        <p className="meta">Effective August 2, 2026</p>
      </div>

      <div className="prose">
        <h2>Information we collect</h2>
        <p>
          When you register, we collect your name, email address, country, selected program,
          and a securely hashed password. As you study, we record course progress, quiz and
          assessment results, written submissions, instructor feedback, certificates, and
          community contributions. If you apply for a scholarship, we also collect the financial
          circumstances, training goals, and possible contribution amount you choose to share.
          Our hosting providers may also retain standard security and request logs.
        </p>

        <h2>Payments</h2>
        <p>
          Online card payments are handled on Stripe&apos;s hosted checkout. KingsWord Training
          Institute records payment status and Stripe transaction identifiers, but this
          website does not collect or store your full card number. Bank transfers are verified
          manually by authorized staff.
        </p>

        <h2>How we use information</h2>
        <p>
          We use this information to create and secure your account, administer enrollment,
          confirm payment, provide course access, save learning progress, grade assessments,
          review scholarship eligibility, moderate community groups, issue certificates, respond
          to support requests, and protect the service from misuse.
        </p>

        <h2>Service providers and access</h2>
        <p>
          Authorized KingsWord staff can access records needed to operate the program. Scholarship
          applications and private review notes are restricted to authorized staff. The
          website relies on Vercel for hosting, Neon for managed database services, and Stripe
          for online payments. These providers process information under their own security
          and privacy terms. We do not sell registration or learning records.
        </p>

        <h2>Retention and your choices</h2>
        <p>
          We retain records for as long as needed to provide the program, maintain academic and
          payment records, resolve disputes, secure the service, and meet applicable legal
          obligations. You may request access to, correction of, or deletion of your account
          information. Some records may need to be retained for legitimate academic, financial,
          security, or legal purposes.
        </p>

        <h2>International use and security</h2>
        <p>
          The program is administered from the United States and may use providers that process
          data in other countries. We use access controls, encrypted connections, password
          hashing, and restricted staff tools, but no internet service can guarantee absolute
          security.
        </p>

        <h2>Contact us</h2>
        <p>
          For privacy questions or account requests, email <a href="mailto:kti@kingsword.org">kti@kingsword.org</a>{" "}
          or call <a href="tel:+17732778701">+1 773 277 8701</a>. We may update this notice as
          the program or its service providers change.
        </p>
      </div>
    </main>
  );
}
