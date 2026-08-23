"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV_ITEMS, isAdminRouteActive } from "@/lib/admin-navigation";

export default function AdminNav({
  pendingScholarshipCount,
}: {
  pendingScholarshipCount: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="admin-tabs" aria-label="Staff operations sections">
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isAdminRouteActive(pathname, item.href);
        const showCount = item.href === "/admin/scholarships" && pendingScholarshipCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`admin-tab${active ? " on" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
            {showCount ? (
              <span className="admin-tab-count">{pendingScholarshipCount}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
