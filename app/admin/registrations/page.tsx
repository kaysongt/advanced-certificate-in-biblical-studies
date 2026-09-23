import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AdminNav from "@/components/AdminNav";
import { currentStudent, isStaff } from "@/lib/auth";
import { staffLoginPath, STAFF_ACCESS_REQUIRED_PATH } from "@/lib/login-redirect";
import { loadRegistrationReport } from "@/lib/registration-report";
import { REGISTRATION_GROUPS, registrationGroup, registrationGroupLabel } from "@/lib/registration-groups";

export const metadata: Metadata = { title: "Registration groups", robots: { index: false, follow: false } };

export default async function RegistrationGroupsPage({ searchParams }: {
  searchParams: Promise<{ group?: string; q?: string; page?: string }>;
}) {
  const actor = await currentStudent();
  if (!actor) redirect(staffLoginPath("/admin/registrations"));
  if (!isStaff(actor)) redirect(STAFF_ACCESS_REQUIRED_PATH);
  const params = await searchParams;
  const selectedGroup = registrationGroup(params.group);
  const query = (params.q ?? "").trim();
  const { students, evidence, pendingScholarships } = await loadRegistrationReport();
  const grouped = selectedGroup ? students.filter((student) => evidence.get(student.id)!.group === selectedGroup) : students;
  const visible = grouped.filter((student) => `${student.fullName} ${student.email} ${student.country}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(visible.length / 25));
  const requestedPage = Number(params.page);
  const page = Number.isFinite(requestedPage) ? Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1)) : 1;
  const pageUrl = (value: number) => `/admin/registrations?${new URLSearchParams({ ...(selectedGroup ? { group: selectedGroup } : {}), q: query, page: String(value) })}`;
  const groupExport = `/admin/registrations/export${selectedGroup ? `?group=${selectedGroup}` : ""}`;
  return <main className="shell admin-shell" id="main-content" tabIndex={-1}>
    <header className="pagehead">
      <div className="eyebrow">KingsWord administration</div>
      <h1>Registration groups</h1>
      <p className="deck">Find scholarship applicants, minister-code users, payment activity, and other registered accounts.</p>
    </header>
    <AdminNav pendingScholarshipCount={pendingScholarships} />
    <section className="admin-section">
      <div className="admin-section-head admin-export-head">
        <div><h2>All registered accounts</h2><p>{students.length} people. One primary group per person.</p></div>
        <a className="btn" href="/admin/registrations/export">Download all registrations (CSV)</a>
      </div>
      <nav className="admin-registration-summary" aria-label="Registration groups">
        <Link href="/admin/registrations" className={!selectedGroup ? "is-active" : undefined} aria-current={!selectedGroup ? "page" : undefined}><strong>{students.length}</strong> All</Link>
        {REGISTRATION_GROUPS.map((group) => <Link key={group.key} href={`/admin/registrations?group=${group.key}`} className={selectedGroup === group.key ? "is-active" : undefined} aria-current={selectedGroup === group.key ? "page" : undefined}>
          <strong>{students.filter((student) => evidence.get(student.id)!.group === group.key).length}</strong> {group.label}
        </Link>)}
      </nav>
      <p className="admin-form-note">When categories overlap, the order is scholarship → minister code → payment activity → others. Details and exports retain all recorded activity. Scholarship applicants include pending, approved, and declined applications.</p>
      <details className="registration-group-method"><summary>How payment and code records are interpreted</summary>
        <p>Checkout started, open, failed, or expired does not mean money was received. A completed zero-cost checkout is not a payment. Refunds, disputes, and manual activations are identified separately.</p>
        <p>Groups use all stored checkout attempts. Code usage appears only when the exact code is recorded; rejected or unrecorded code entries cannot be inferred. “Others” includes accounts with no matching recorded activity, including staff accounts.</p>
      </details>
      <form className="admin-search-form" method="get">
        {selectedGroup ? <input type="hidden" name="group" value={selectedGroup} /> : null}
        <label htmlFor="registration-group-search">Search this group</label>
        <div><input id="registration-group-search" name="q" defaultValue={query} placeholder="Name, email, or country" />
          <button className="btn primary">Search</button><Link className="btn" href={selectedGroup ? `/admin/registrations?group=${selectedGroup}` : "/admin/registrations"}>Clear search</Link>
        </div>
      </form>
      <div className="admin-section-head admin-export-head">
        <p>{visible.length} matching accounts of {grouped.length} in {selectedGroup ? registrationGroupLabel(selectedGroup) : "all groups"}; up to 25 per page.</p>
        {selectedGroup ? <a className="btn" href={groupExport}>Download this group (CSV)</a> : null}
      </div>
      <p className="admin-form-note">Downloads include the whole selected group, not just the current search or page. Share only with authorized KTI leaders.</p>
      <div className="admin-list">
        {visible.slice((page - 1) * 25, page * 25).map((student) => {
          const details = evidence.get(student.id)!;
          return <article key={student.id} className="admin-card admin-card-stack registration-group-person">
            <div className="admin-student-identity"><strong>{student.fullName}</strong><a href={`mailto:${student.email}`}>{student.email}</a><span className="admin-student-meta">{student.country} · {student.role} · Registered {student.createdAt.slice(0, 10)} (UTC)</span></div>
            <p><strong>{registrationGroupLabel(details.group)}</strong></p>
            <p>Scholarship: {details.scholarshipStatuses}</p>
            <p>Minister code: {details.ministerCodeStatus}</p>
            <details><summary>Payment / checkout history ({details.checkoutCount} checkouts)</summary><p className="registration-payment-history">{details.paymentDetails}</p></details>
          </article>;
        })}
      </div>
      {!visible.length ? <p className="admin-empty">No registered accounts match this group and search.</p> : null}
      {pages > 1 ? <nav className="admin-pagination" aria-label="Registration pages">
        {page > 1 ? <Link className="btn" href={pageUrl(page - 1)}>Previous</Link> : null}<span>Page {page} of {pages}</span>{page < pages ? <Link className="btn" href={pageUrl(page + 1)}>Next</Link> : null}
      </nav> : null}
    </section>
  </main>;
}
