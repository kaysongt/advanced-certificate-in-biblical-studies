import Link from "next/link";

import { getModuleStatuses } from "@/lib/content";
import { PRICING, getCurriculum } from "@/lib/curriculum";

export default function HomePage() {
  const { program, grading } = getCurriculum();
  const moduleStatuses = getModuleStatuses();
  const availableCount = moduleStatuses.filter((s) => s.complete).length;

  return (
    <main>
      {/* ---------------------------------------------------------- hero */}
      <section className="hero">
        <div className="wide">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="logo"
            src="/assets/logo.jpg"
            alt={`${program.institute} — Equip, Empower, Transform`}
            width={1200}
            height={812}
          />
          {/* The logo already carries Equip · Empower · Transform — no need to repeat it. */}
          <h1>Know God&rsquo;s Word for yourself</h1>
          <p className="deck">
            {program.tagline} Study at your own pace, wherever you are, and come out able to
            open the Bible and understand what you are reading.
          </p>
          <div className="cta-row">
            <Link href="/enroll" className="btn lg gold">
              Enroll now
            </Link>
            <Link href="/curriculum" className="btn lg ghost">
              See what you will study
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- figures */}
      <div className="wide">
        <div className="figures">
          <div className="figure">
            <div className="n">{program.total_hours}</div>
            <div className="l">Hours</div>
          </div>
          <div className="figure">
            <div className="n">{program.total_certificates}</div>
            <div className="l">Certificates</div>
          </div>
          <div className="figure">
            <div className="n">{program.total_courses}</div>
            <div className="l">Courses</div>
          </div>
          <div className="figure">
            <div className="n">{program.total_textbooks}</div>
            <div className="l">Textbooks</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ outcomes */}
      <section className="section">
        <div className="wide">
          <div className="sec-head">
            <div className="eyebrow">What you will gain</div>
            <h2>What you will be able to do</h2>
            <p>{program.summary}</p>
          </div>
          <div className="outcomes">
            {program.outcomes.map((outcome) => (
              <div className="outcome" key={outcome}>
                <span className="tick" aria-hidden="true">
                  ✓
                </span>
                <span>{outcome}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- curriculum */}
      <section className="section tint">
        <div className="wide">
          <div className="sec-head">
            <div className="eyebrow">The program</div>
            <h2>Five certificates, one foundation</h2>
            <p>
              Take one on its own, or work through all five. Finish everything and you
              receive the {program.title}.
            </p>
          </div>
          <div className="cards five">
            {moduleStatuses.map(({ module, complete, coursesComplete, courses }) => (
              <Link className="card" href={`/curriculum/${module.slug}`} key={module.slug}>
                <div className="cardtop">
                  <span className="eyebrow">
                    Module {module.numeral} &middot; {module.hours} hrs
                  </span>
                  <span className={`avail ${complete ? "now" : "soon"}`}>
                    {complete ? "Available now" : module.availability ?? "Coming soon"}
                  </span>
                </div>
                <span className="t">{module.short_title}</span>
                <p>{module.catalog_blurb}</p>
                <span className="foot">
                  {module.courses.length} courses &middot; {module.series}
                  {!complete && coursesComplete > 0
                    ? ` · ${coursesComplete}/${courses} written`
                    : ""}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- instructor */}
      <section className="section">
        <div className="wide">
          <div className="sec-head">
            <div className="eyebrow">{program.founder.role}</div>
            <h2>{program.founder.name}</h2>
            <p>{program.founder.bio}</p>
          </div>
          <p className="pullquote">&ldquo;{program.motto}&rdquo;</p>
        </div>
      </section>

      {/* -------------------------------------------------------- format */}
      <section className="section tint">
        <div className="wide">
          <div className="sec-head">
            <div className="eyebrow">How it works</div>
            <h2>Study at your own pace</h2>
            <p>{program.format}</p>
          </div>
          <div className="outcomes">
            {program.features.map((feature) => (
              <div className="outcome" key={feature}>
                <span className="tick" aria-hidden="true">
                  ✓
                </span>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- pricing */}
      <section className="section" id="pricing">
        <div className="wide">
          <div className="sec-head">
            <div className="eyebrow">Tuition</div>
            <h2>Start with one, or take all five</h2>
            <p>{program.graduation_requirements}</p>
          </div>
          <div className="pricing">
            <div className="price">
              <div className="plan">Single certificate</div>
              <div className="amount">
                {PRICING.certificate.label} <span>/ certificate</span>
              </div>
              <p className="blurb">
                Any one of the five certificate programs.
                {availableCount > 0
                  ? ` ${availableCount} available to start today.`
                  : ""}
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
                All five certificates &mdash; {program.total_hours} hours,{" "}
                {program.total_courses} courses. Each unlocks as it is released.
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
        </div>
      </section>

      {/* ----------------------------------------------------------- faq */}
      <section className="section tint">
        <div className="wide">
          <div className="sec-head">
            <div className="eyebrow">Questions</div>
            <h2>Before you enroll</h2>
          </div>
          <div className="faq">
            <details>
              <summary>Who is this program for?</summary>
              <div className="ans">{program.audience.join(", ")}.</div>
            </details>
            <details>
              <summary>How long does it take?</summary>
              <div className="ans">
                The full program is {program.total_hours} contact hours across{" "}
                {program.total_courses} courses. It is self-paced, so you set the schedule.
                Each certificate can be taken on its own.
              </div>
            </details>
            <details>
              <summary>How am I assessed?</summary>
              <div className="ans">
                {grading.components.map((c) => `${c.name} ${c.weight}%`).join(", ")}. The pass
                mark is {grading.pass_mark}%. Every course ends with an assessment covering
                its lessons.
              </div>
            </details>
            <details>
              <summary>What do I receive at the end?</summary>
              <div className="ans">{program.graduation_requirements}</div>
            </details>
            <details>
              <summary>Are textbooks included?</summary>
              <div className="ans">
                Yes. The program includes {program.total_textbooks} customized textbooks,
                one per course, written to accompany the lessons.
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ final cta */}
      <section className="section">
        <div className="wide" style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", marginBottom: 10 }}>
            Begin your training
          </h2>
          <Link href="/enroll" className="btn lg gold">
            Enroll now
          </Link>
        </div>
      </section>
    </main>
  );
}
