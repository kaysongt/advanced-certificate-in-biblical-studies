import type { Metadata } from "next";
import Link from "next/link";

import { PRICING, getCurriculum } from "@/lib/curriculum";

export const metadata: Metadata = { title: "Tuition" };
export const dynamic = "force-dynamic";

export default function PricingPage() {
  const { program, grading } = getCurriculum();

  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">Tuition</div>
        <h1>Enrollment options</h1>
        <p className="deck">{program.tuition}</p>
      </div>

      <div className="pricing" style={{ marginTop: 30 }}>
        <div className="price">
          <div className="plan">Pay per certificate</div>
          <div className="amount">
            {PRICING.certificate.label} <span>/ certificate</span>
          </div>
          <p className="blurb">
            Start with a certificate and pay as you progress through the program. Complete all five
            certificates to earn the Advanced Certificate in Biblical Studies.
          </p>
          <ul>
            <li>All courses within that certificate</li>
            <li>Topic quizzes and course assessments</li>
            <li>Customized textbooks</li>
            <li>Modular certificate on completion</li>
          </ul>
          <Link href="/enroll?plan=certificate" className="btn primary lg">
            Choose a certificate
          </Link>
        </div>

        <div className="price feature">
          <div className="plan">Advanced Certificate</div>
          <div className="amount">
            {PRICING.advanced.label} <span>/ full program</span>
          </div>
          <p className="blurb">
            All five certificates &mdash; {program.total_hours} hours across{" "}
            {program.total_courses} courses.
          </p>
          <ul>
            <li>Everything in all five certificates</li>
            <li>{program.total_textbooks} customized textbooks</li>
            <li>Course assessments and final evaluations</li>
            <li>Advanced Certificate in Biblical Studies</li>
          </ul>
          <Link href="/enroll?plan=advanced" className="btn primary lg">
            Enroll in the full program
          </Link>
        </div>
      </div>

      <div className="prose" style={{ marginTop: 44 }}>
        <h2>Assessment and grading</h2>
        {/*
          grading.note is an internal sign-off reminder for Dr. Kay, not customer
          copy. It stays in curriculum.json for the team; it is not rendered here.
        */}
        <p>
          You need {grading.pass_mark}% to pass, and you cannot move on to the next topic or
          course until you have passed the one before it.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {grading.components.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{c.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Pass mark: <strong>{grading.pass_mark}%</strong>
        </p>
        <h2>Graduation</h2>
        <p>{program.graduation_requirements}</p>
      </div>
    </main>
  );
}
