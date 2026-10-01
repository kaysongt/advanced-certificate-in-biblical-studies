import type { Metadata } from "next";

import Masthead from "@/components/Masthead";
import SiteFooter from "@/components/SiteFooter";
import { getCurriculum } from "@/lib/curriculum";

import "./globals.css";

const { program } = getCurriculum();

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${program.contact.website}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${program.title} — ${program.institute}`,
    template: `%s — ${program.institute}`,
  },
  description: program.summary.slice(0, 155),
  icons: {
    icon: "/_next/image?url=%2Fassets%2Fkti-brand-2026.png&w=64&q=75",
    apple: "/_next/image?url=%2Fassets%2Fkti-brand-2026.png&w=256&q=75",
  },
  openGraph: {
    title: `${program.title} — ${program.institute}`,
    description: program.summary.slice(0, 155),
    images: [{ url: "/assets/kti-brand-2026.png", width: 1536, height: 1024, alt: "KingsWord Training Institute — Advanced Certificate in Biblical Studies" }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/assets/kti-brand-2026.png"] },
};

/** Applies the stored theme before first paint, so there is no flash. */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('kti.theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // THEME_BOOT below sets data-theme on <html> before React hydrates, so the
  // stored theme applies with no flash of the wrong palette. That means the
  // attribute React sees on mount never matches what it rendered on the
  // server — an expected, deliberate mismatch, not a bug. suppressHydration-
  // Warning tells React to trust the DOM here instead of overwriting it.
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <Masthead />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
