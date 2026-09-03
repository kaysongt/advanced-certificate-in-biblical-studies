import type { StudentRole } from "./db/types";

export const DASHBOARD_PATH = "/dashboard";
export const STAFF_ACCESS_REQUIRED_PATH = "/dashboard?access=staff-required";

const INTERNAL_ORIGIN = "https://www.thekti.org";

/** Keep post-login redirects on this site, even when `next` was user supplied. */
export function safeReturnPath(
  requested: string | null | undefined,
  fallback = DASHBOARD_PATH
): string {
  if (!requested?.startsWith("/")) return fallback;

  try {
    const parsed = new URL(requested, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function isStaffOperationsPath(pathname: string): boolean {
  return /^\/admin(?:[/?#]|$)/.test(pathname);
}

export function isStaffRole(role: StudentRole): boolean {
  return role === "staff" || role === "admin";
}

export function postLoginPath(role: StudentRole, requested: string | null | undefined): string {
  const next = safeReturnPath(requested);
  if (isStaffOperationsPath(next) && !isStaffRole(role)) {
    return STAFF_ACCESS_REQUIRED_PATH;
  }
  return next;
}

export function staffLoginPath(destination: string): string {
  return `/login?next=${encodeURIComponent(safeReturnPath(destination, "/admin"))}`;
}
