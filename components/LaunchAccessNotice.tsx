import Link from "next/link";
import { getCurriculum, isModuleReleased, moduleReleaseLabel, formatModuleReleaseDate, MODULE_OPENING_TIME_LABEL } from "@/lib/curriculum";

export default function LaunchAccessNotice({ signedIn = false }: { signedIn?: boolean }) {
  const [first, second] = getCurriculum().modules;
  return <section className="notice" aria-label="Course access and payment deadline">
    <strong>Module 1: {first.short_title}</strong>
    <p>{isModuleReleased(first) ? "Now open to all registered students—no upfront tuition payment is needed to start." : `${moduleReleaseLabel(first)}. All registered students can start without paying tuition upfront.`}</p>
    <p>To continue into Module 2 and later, your enrollment must be cleared through payment, a verified minister waiver, or an approved scholarship covering that module. Arrange payment before Module 2 opens on {formatModuleReleaseDate(second)} at {MODULE_OPENING_TIME_LABEL}. If your enrollment is already cleared, you do not need to pay again.</p>
    <Link href={signedIn ? `/curriculum/${first.slug}` : `/login?next=/curriculum/${first.slug}`}>{isModuleReleased(first) ? "Open Module 1 →" : "View Module 1 and opening details →"}</Link>
    <p><a href="/student-guide.pdf" target="_blank" rel="noopener noreferrer">New here? Read or download the student quick-start guide (PDF).</a></p>
  </section>;
}
