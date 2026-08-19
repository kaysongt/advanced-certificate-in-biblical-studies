export const PRIMARY_NAV_ITEMS = [
  { href: "/curriculum", label: "Curriculum" },
  { href: "/pricing", label: "Pricing" },
  { href: "/scholarship", label: "Scholarships" },
  { href: "/community", label: "Community" },
  { href: "/glossary", label: "Glossary" },
] as const;

export function isPrimaryRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
