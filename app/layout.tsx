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
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('kti.theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
