import Link from "next/link";
import Image from "next/image";

import AuthNav from "./AuthNav";
import PrimaryNav from "./PrimaryNav";
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
          <Image className="mark" src="/assets/kti-brand-2026.png" alt="" width={1536} height={1024} sizes="96px" loading="eager" />
          <span className="wm-txt">
            <span className="kw">KingsWord</span> Training Institute
          </span>
        </Link>
        <nav className="mastnav" aria-label="Main navigation">
          <PrimaryNav />
          <AuthNav />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
