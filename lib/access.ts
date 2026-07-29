import type { Enrollment } from "./db/types";

/** Only paid/activated enrollments grant access to study material. */
export function hasActiveAccess(enrollments: Enrollment[], moduleSlug: string): boolean {
  return enrollments.some(
    (enrollment) =>
      enrollment.status === "active" &&
      (enrollment.product === "advanced" || enrollment.product === moduleSlug)
  );
}

