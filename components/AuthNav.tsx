"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The sign-in-state-dependent part of the masthead nav.
 *
 * Renders logged-out by default — correct for the static HTML search engines
 * and first paint see — then checks /api/session after mount and swaps to
 * "My studies" if a session exists. This keeps Masthead a plain server
 * component that never reads cookies(), so marketing pages stay statically
 * prerenderable. See app/api/session/route.ts.
 */
export default function AuthNav() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSignedIn(!!d.signedIn);
      })
      .catch(() => {
        /* stay logged-out on failure — /enroll and /login both work either way */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn) {
    return (
      <Link href="/dashboard" className="btn primary" style={{ marginLeft: 6 }}>
        My studies
      </Link>
    );
  }

  return (
    <>
      <Link href="/login">Sign in</Link>
      <Link href="/enroll" className="btn primary" style={{ marginLeft: 6 }}>
        Enroll
      </Link>
    </>
  );
}
