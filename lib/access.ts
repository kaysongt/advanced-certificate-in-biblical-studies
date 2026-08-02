import type { Enrollment } from "./db/types";

/** Only paid/activated enrollments grant access to study material. */
export function hasActiveAccess(enrollments: Enrollment[], moduleSlug: string): boolean {
  return enrollments.some(
    (enrollment) =>
      enrollment.status === "active" &&
      !enrollment.accessSuspendedAt &&
      (enrollment.product === "advanced" || enrollment.product === moduleSlug)
  );
}

/** A place reserved at registration, still waiting on tuition. */
export function hasUnpaidEnrollment(enrollments: Enrollment[]): boolean {
  return enrollments.some((enrollment) => enrollment.status === "pending");
}

/**
 * True when nothing at all is unlocked and tuition is outstanding. Students who
 * registered before checkout existed land here and are sent to payment at login.
 */
export function mustPayBeforeStudying(enrollments: Enrollment[]): boolean {
  return (
    hasUnpaidEnrollment(enrollments) &&
    !enrollments.some(
      (enrollment) => enrollment.status === "active" && !enrollment.accessSuspendedAt
    )
  );
}

/**
 * Where to send a signed-in student who reached material they have not paid for.
 * An existing student owing tuition needs the payment prompt, not the sign-up form.
 */
export function entitlementRedirectPath(enrollments: Enrollment[]): string {
  return hasUnpaidEnrollment(enrollments) ? "/dashboard?payment=required" : "/enroll";
}
