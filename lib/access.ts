import type { Enrollment } from "./db/types";

export type ModuleEnrollmentState = "active" | "pending" | "suspended" | "none";

function enrollmentCoversModule(enrollment: Enrollment, moduleSlug: string): boolean {
  return enrollment.product === "advanced" || enrollment.product === moduleSlug;
}

/** Enrollment coverage is distinct from access: pending tuition still reserves a student's plan. */
export function getModuleEnrollmentState(
  enrollments: Enrollment[],
  moduleSlug: string
): ModuleEnrollmentState {
  const matching = enrollments.filter((enrollment) =>
    enrollmentCoversModule(enrollment, moduleSlug)
  );

  if (
    matching.some(
      (enrollment) => enrollment.status === "active" && !enrollment.accessSuspendedAt
    )
  ) {
    return "active";
  }
  if (matching.some((enrollment) => enrollment.status === "pending")) return "pending";
  if (matching.some((enrollment) => enrollment.status === "active")) return "suspended";
  return "none";
}

/** Only paid/activated enrollments grant access to study material. */
export function hasActiveAccess(enrollments: Enrollment[], moduleSlug: string): boolean {
  return getModuleEnrollmentState(enrollments, moduleSlug) === "active";
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
