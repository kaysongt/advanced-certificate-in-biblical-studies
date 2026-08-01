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
  icons: { icon: "/assets/favicon.png", apple: "/assets/favicon.png" },
  openGraph: {
    title: `${program.title} — ${program.institute}`,
    description: program.summary.slice(0, 155),
    images: ["/assets/logo.jpg"],
    type: "website",
  },
  twitter: { card: "summary_large_image" },
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
        <Masthead />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
