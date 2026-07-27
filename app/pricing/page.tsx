import type { Metadata } from "next";
import Link from "next/link";

import { getModuleStatuses } from "@/lib/content";
import { PRICING, getCurriculum } from "@/lib/curriculum";

export const metadata: Metadata = { title: "Tuition" };

export default function PricingPage() {
  const { program, grading } = getCurriculum();
  const available = getModuleStatuses().filter((s) => s.complete).length;

  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">Tuition</div>
        <h1>Enrolment options</h1>
        <p className="deck">{program.tuition}</p>
      </div>

      <div className="pricing" style={{ marginTop: 30 }}>
        <div className="price">
          <div className="plan">Single certificate</div>
          <div className="amount">
            {PRICING.certificate.label} <span>/ certificate</span>
          </div>
          <p className="note">
            Any one of the five programmes. {available} available to start today.
          </p>
          <ul>
            <li>All courses within that certificate</li>
            <li>Lesson quizzes and course assessments</li>
            <li>Customised textbooks</li>
            <li>Modular certificate on completion</li>
          </ul>
          <Link href="/enroll?plan=certificate" className="btn primary lg">
            Choose a certificate
          </Link>
        </div>

        <div className="price feature">
          <div className="plan">Advanced Certificate</div>
          <div className="amount">
            {PRICING.advanced.label} <span>/ full programme</span>
          </div>
          <p className="note">
            All five certificates &mdash; {program.total_hours} hours across{" "}
            {program.total_courses} courses.
          </p>
          <ul>
            <li>Everything in all five certificates</li>
            <li>{program.total_textbooks} customised textbooks</li>
            <li>Student community engagement</li>
            <li>Advanced Certificate in Biblical Studies</li>
          </ul>
          <Link href="/enroll?plan=advanced" className="btn primary lg">
            Enrol in the full programme
          </Link>
        </div>
      </div>

      <div className="prose" style={{ marginTop: 44 }}>
        <h2>Assessment and grading</h2>
        <p>
          <em>{grading.note}</em>
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
