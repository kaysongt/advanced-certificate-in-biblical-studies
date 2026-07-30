import Link from "next/link";

import AuthNav from "./AuthNav";
import ThemeToggle from "./ThemeToggle";

/**
 * Deliberately NOT async and never reads cookies() — that would force every
 * page in the app to render dynamically, since Masthead sits in RootLayout
 * and wraps every route. The sign-in-state part lives in <AuthNav>, a client
 * component that checks session after mount, so marketing pages (/, /pricing,
 * /curriculum, /glossary) stay statically prerenderable.
 */
export default function Masthead() {
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
          <Link href="/pricing" className="hide-sm">
            Pricing
          </Link>
          <Link href="/community" className="hide-sm">
            Community
          </Link>
          <Link href="/glossary" className="hide-sm">
            Glossary
          </Link>
          <AuthNav />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
