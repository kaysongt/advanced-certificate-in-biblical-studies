export const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Operations" },
  { href: "/admin/scholarships", label: "Scholarship applications" },
] as const;

export function isAdminRouteActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // "/admin" is the parent of every other admin route, so only an exact
  // match should light it up — otherwise it would stay active on
  // "/admin/scholarships" too and both tabs would look selected at once.
  if (href === "/admin") return false;
  return pathname.startsWith(`${href}/`);
}
