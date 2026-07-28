import Link from "next/link";

import { currentStudent } from "@/lib/auth";

import ThemeToggle from "./ThemeToggle";

export default async function Masthead() {
  const student = await currentStudent();

  return (
    <header className="masthead">
      <div className="inner">
        <Link className="wordmark" href="/" aria-label="KingsWord Training Institute — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mark" src="/assets/logo-mark.jpg" alt="" width={440} height={268} />
          <span className="wm-txt">
            <span className="kw">KingsWord</span> Training Institute
          </span>
        </Link>
        <nav className="mastnav">
          <Link href="/curriculum" className="hide-sm">
            Curriculum
          </Link>
          {student ? null : (
            <Link href="/pricing" className="hide-sm">
              Pricing
            </Link>
          )}
          <Link href="/glossary" className="hide-sm">
            Glossary
          </Link>
          {student ? (
            <Link href="/dashboard" className="btn primary" style={{ marginLeft: 6 }}>
              My studies
            </Link>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/enroll" className="btn primary" style={{ marginLeft: 6 }}>
                Enrol
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
