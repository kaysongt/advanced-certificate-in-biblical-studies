import { getCurriculum } from "@/lib/curriculum";
import Link from "next/link";
import Image from "next/image";

export default function SiteFooter() {
  const { program } = getCurriculum();
  const { phone, email, website } = program.contact;

  return (
    <footer className="sitefoot">
      <div className="inner">
        <Link href="/" className="footer-brand"><Image src="/assets/kti-brand-2026.png" alt="" width={1536} height={1024} sizes="90px" /> <span>{program.institute}</span></Link>
        <span className="right">
          <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
          &nbsp; <a href={`mailto:${email}`}>{email}</a>
          &nbsp; <Link href="/privacy">Privacy</Link>
          &nbsp; <a href={`https://${website}`}>{website}</a>
        </span>
      </div>
    </footer>
  );
}
