import { getCurriculum } from "@/lib/curriculum";
import Link from "next/link";

export default function SiteFooter() {
  const { program } = getCurriculum();
  const { phone, email, website } = program.contact;

  return (
    <footer className="sitefoot">
      <div className="inner">
        <span>{program.institute}</span>
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
