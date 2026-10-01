// The grace period includes all of Sunday in Nigeria (UTC+1).
export const REGISTRATION_CLOSES_AT = "2026-10-05T00:00:00+01:00";
export const REGISTRATION_DEADLINE_LABEL = "Sunday, October 4, 2026 at 11:59 p.m. WAT (Nigeria time)";
export function isRegistrationOpen(now = new Date()): boolean {
  return now.getTime() < Date.parse(REGISTRATION_CLOSES_AT);
}
