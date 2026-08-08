import Link from "next/link";
import Image from "next/image";

import { getModuleStatuses } from "@/lib/content";
import {
  PRICING,
  getCurriculum,
  moduleReleaseLabel,
} from "@/lib/curriculum";

export const dynamic = "force-dynamic";

const STUDY_STEPS = [
  {
    number: "01",
    title: "Choose your path",
    copy: "Reserve your place, choose your certificate path, and begin when its scheduled study window opens.",
  },
  {
    number: "02",
    title: "Study with a rhythm",
    copy: "Move through structured topics, customized textbooks, and online resources at the pace that fits your life.",
  },
  {
    number: "03",
    title: "Demonstrate your learning",
    copy: "Pass each topic quiz and course assessment at 80% before moving forward with confidence.",
  },
];

export default function HomePage() {
  const { program, grading } = getCurriculum();
  const moduleStatuses = getModuleStatuses();
  const firstModule = moduleStatuses[0];
  const fullProgramSavings =
    PRICING.certificate.amount * program.total_certificates - PRICING.advanced.amount;
  const fullProgramSavingsLabel = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: PRICING.advanced.currency,
    maximumFractionDigits: 0,
  }).format(fullProgramSavings);

  return (
    <main className="marketing-home">
      <section className="hero home-hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="wide hero-grid">
          <div className="hero-copy">
            <h1>
              Know God&rsquo;s Word <em>for yourself.</em>
            </h1>
            <p className="hero-lede">
              A Bible-centered program for believers who want a sure foundation in Scripture,
              sound doctrine, and practical Christian living.
            </p>
            <div className="hero-actions">
              <Link href="/enroll" className="btn lg gold hero-action" aria-label="Start your training">
                Start
              </Link>
              <Link
                href="/curriculum"
                className="btn lg ghost hero-action"
                aria-label="Explore the curriculum"
              >
                Explore
              </Link>
            </div>

            <dl className="hero-stats">
              <div>
                <dt>{program.total_hours}</dt>
                <dd>contact hours</dd>
              </div>
              <div>
                <dt>{program.total_certificates}</dt>
                <dd>certificates</dd>
              </div>
              <div>
                <dt>{program.total_courses}</dt>
                <dd>courses</dd>
              </div>
            </dl>
          </div>

          <aside className="hero-panel" aria-label="Program overview">
            <div className="hero-panel-top">
              <span>Advanced Certificate</span>
              <span>Now enrolling</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hero-mark" src="/assets/logo-mark.jpg" alt="" width={440} height={268} />
            <div className="hero-panel-intro">
              <span className="hero-panel-label">Your starting point</span>
              <div>
                <strong>Module I</strong>
                <span>Systematic Theology</span>
              </div>
              <span className="hero-open">
                {firstModule.available ? "Available now" : moduleReleaseLabel(firstModule.module)}
              </span>
            </div>
            <ol className="hero-route">
              {moduleStatuses.slice(0, 3).map(({ module, available }, index) => (
                <li key={module.slug} className={available ? "ready" : "upcoming"}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{module.short_title}</strong>
                  <em>{available ? "Open" : moduleReleaseLabel(module)}</em>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      <section className="section home-section gain-section">
        <div className="wide">
          <div className="section-lead split-lead">
            <div>
              <div className="eyebrow">Rooted for real life</div>
              <h2>Not just more information. A stronger foundation.</h2>
            </div>
            <p>{program.summary}</p>
          </div>
          <div className="capability-grid">
            {program.outcomes.map((outcome, index) => (
              <div className="capability" key={outcome}>
                <span className="capability-number">{String(index + 1).padStart(2, "0")}</span>
                <p>{outcome}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section path-section">
        <div className="wide">
          <div className="section-lead split-lead">
            <div>
              <div className="eyebrow">The learning journey</div>
              <h2>Five certificates, one coherent path.</h2>
            </div>
            <p>
              Start where you are. Each certificate stands on its own, and together they form the
              {" "}{program.title}.
            </p>
          </div>
          <div className="module-path-grid">
            {moduleStatuses.map(({ module, available }) => (
              <Link className="path-card" href={`/curriculum/${module.slug}`} key={module.slug}>
                <div className="path-card-top">
                  <span>0{module.number}</span>
                  <span className={available ? "path-status is-ready" : "path-status"}>
                    {available ? "Available" : moduleReleaseLabel(module)}
                  </span>
                </div>
                <h3>{module.short_title}</h3>
                <p>{module.catalog_blurb}</p>
                <span className="path-card-meta">
                  {module.hours} hours <span aria-hidden="true">&middot;</span> {module.courses.length} courses
                </span>
              </Link>
            ))}
          </div>
          <Link href="/curriculum" className="text-action path-link">
            See the full curriculum <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>

      <section className="section home-section process-section">
        <div className="wide process-layout">
          <div className="process-intro">
            <div className="eyebrow">A clear way forward</div>
            <h2>Built around real study, not a rushed finish line.</h2>
            <p>{program.format}</p>
            <div className="assessment-callout">
              <strong>{grading.pass_mark}%</strong>
              <span>
                is the clear pass mark for every topic quiz and course assessment.
              </span>
            </div>
          </div>
          <div className="process-steps">
            {STUDY_STEPS.map((step) => (
              <article className="process-step" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
          <div className="features-bar" aria-label="Included in every certificate">
            {program.features.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section founder-section" id="founder">
        <div className="wide founder-grid">
          <div className="founder-portrait">
            <Image
              src="/assets/dr-kay-ijisesan.jpg"
              alt="Dr. Kay Ijisesan, Founder and President of KingsWord Training Institute"
              fill
              sizes="(max-width: 700px) calc(100vw - 36px), (max-width: 1040px) 520px, 38vw"
            />
            <div className="founder-portrait-label">
              <span>Founder &amp; President</span>
              <strong>Dr. Kay Ijisesan</strong>
            </div>
          </div>
          <div className="founder-copy">
            <div className="eyebrow">{program.founder.role}</div>
            <h2>{program.founder.name}</h2>
            <p>{program.founder.bio}</p>
            <blockquote className="founder-quote">
              <span aria-hidden="true">&ldquo;</span>
              <p>
                {program.motto}<span className="founder-quote-close" aria-hidden="true">&rdquo;</span>
              </p>
              <cite>KingsWord Training Institute</cite>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="section home-section tuition-section" id="pricing">
        <div className="wide">
          <div className="section-lead centered-lead">
            <div className="eyebrow">Tuition</div>
            <h2>Begin with one certificate, or commit to the full journey.</h2>
            <p>{program.graduation_requirements}</p>
          </div>
          <div className="pricing">
            <div className="price">
              <div className="plan">Pay per certificate</div>
              <div className="amount">
                {PRICING.certificate.label} <span>/ certificate</span>
              </div>
              <p className="blurb">
                Start with a certificate and pay as you progress through the program. Complete all
                five certificates to earn the Advanced Certificate in Biblical Studies.
              </p>
              <ul>
                <li>All courses within that certificate</li>
                <li>Topic quizzes and course assessments</li>
                <li>Customized textbooks</li>
                <li>Modular certificate on completion</li>
              </ul>
              <Link href="/enroll?plan=certificate" className="btn quiet lg">
                Choose a certificate
              </Link>
            </div>

            <div className="price feature">
              {fullProgramSavings > 0 ? (
                <span className="price-ribbon">Save {fullProgramSavingsLabel}</span>
              ) : null}
              <div className="plan">Advanced Certificate</div>
              <div className="amount">
                {PRICING.advanced.label} <span>/ full program</span>
              </div>
              <p className="blurb">
                All five certificates, {program.total_hours} hours, and {program.total_courses}
                {" "}courses. Save {fullProgramSavingsLabel} compared with enrolling in all five
                separately. Each certificate unlocks according to its release schedule.
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

      <section className="section home-section faq-section">
        <div className="wide faq-layout">
          <div className="faq-heading">
            <div className="eyebrow">FAQ</div>
            <h2>Everything you need to begin with clarity.</h2>
            <Link href="/pricing" className="text-action">
              View tuition details <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
          <div className="faq">
            <details>
              <summary>Who is this program for?</summary>
              <div className="ans">{program.audience.join(", ")}.</div>
            </details>
            <details>
              <summary>How long does it take?</summary>
              <div className="ans">
                The full program is {program.total_hours} contact hours across {program.total_courses}
                {" "}courses. It is self-paced within a defined time limit, so you can set
                a steady schedule while working toward a clear finish. Each certificate can be
                taken on its own.
              </div>
            </details>
            <details>
              <summary>How am I assessed?</summary>
              <div className="ans">
                {grading.components.map((component) => `${component.name} ${component.weight}%`).join(", ")}. The
                {" "}pass mark is {grading.pass_mark}%. Every course ends with an assessment covering
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
                Yes. The program includes {program.total_textbooks} customized textbooks, one per
                course, written to accompany the lessons.
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="final-section">
        <div className="wide">
          <div className="final-invite">
            <div>
              <div className="eyebrow">Your next chapter</div>
              <h2>Begin your training in the Word.</h2>
            </div>
            <Link href="/enroll" className="btn lg gold">
              Enroll now
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
