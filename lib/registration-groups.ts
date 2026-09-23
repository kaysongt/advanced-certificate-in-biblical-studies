import type { Enrollment, ScholarshipApplication } from "./db/types";

export const MINISTER_CODE = "ORDAINEDMINISTERS2026";
export const REGISTRATION_GROUPS = [
  { key: "scholarship", label: "Scholarship applicants" },
  { key: "minister-code", label: "ORDAINEDMINISTERS2026 code" },
  { key: "payment", label: "Paid or attempted payment" },
  { key: "others", label: "Others" },
] as const;
export type RegistrationGroup = (typeof REGISTRATION_GROUPS)[number]["key"];
export type RegistrationScholarship = Pick<ScholarshipApplication, "studentId" | "status">;
export type RegistrationPayment = {
  enrollmentId: string;
  status: string;
  promotionCode: string | null;
  discountAmountMinor: number;
  paidAmountMinor: number;
  refundedAmountMinor: number;
  currency: string;
  needsReview: boolean;
  updatedAt: string;
};
export type RegistrationEvidence = {
  group: RegistrationGroup;
  scholarshipStatuses: string;
  ministerCodeRecorded: boolean;
  ministerCodeStatus: string;
  checkoutCount: number;
  paymentActivity: boolean;
  paymentDetails: string;
};
export function registrationGroup(value: string | null | undefined): RegistrationGroup | null {
  return REGISTRATION_GROUPS.find((group) => group.key === value)?.key ?? null;
}
export function registrationGroupLabel(group: RegistrationGroup): string {
  return REGISTRATION_GROUPS.find((item) => item.key === group)!.label;
}

const money = (minor: number, currency: string) => `${currency.toUpperCase()} ${(minor / 100).toFixed(2)}`;
const statuses: Record<string, string> = {
  created: "Checkout started", open: "Checkout open", processing: "Payment processing",
  failed: "Payment failed", expired: "Checkout expired", refunded: "Refunded",
  "partially-refunded": "Partially refunded", disputed: "Disputed",
};
export function paymentEvidenceLabel(attempt: RegistrationPayment): string {
  const label = attempt.status === "paid"
    ? attempt.paidAmountMinor > 0 ? "Payment recorded" : "Completed without payment"
    : statuses[attempt.status] ?? attempt.status;
  return `${label}${attempt.paidAmountMinor > 0 ? `; received ${money(attempt.paidAmountMinor, attempt.currency)}` : ""}${attempt.refundedAmountMinor > 0 ? `; refunded ${money(attempt.refundedAmountMinor, attempt.currency)}` : ""}${attempt.needsReview ? "; staff review required" : ""}`;
}

/** Read all recorded attempts, not only the newest retry. No account/access changes. */
export function classifyRegistrations(
  students: { id: string }[], enrollments: Enrollment[],
  scholarships: RegistrationScholarship[], attempts: RegistrationPayment[],
): Map<string, RegistrationEvidence> {
  const enrollmentsByStudent = new Map<string, Enrollment[]>();
  const enrollmentOwners = new Map<string, string>();
  for (const enrollment of enrollments) {
    enrollmentOwners.set(enrollment.id, enrollment.studentId);
    const items = enrollmentsByStudent.get(enrollment.studentId) ?? [];
    items.push(enrollment);
    enrollmentsByStudent.set(enrollment.studentId, items);
  }
  const scholarshipsByStudent = new Map<string, Set<string>>();
  for (const application of scholarships) {
    const items = scholarshipsByStudent.get(application.studentId) ?? new Set<string>();
    items.add(application.status);
    scholarshipsByStudent.set(application.studentId, items);
  }
  const attemptsByStudent = new Map<string, RegistrationPayment[]>();
  for (const attempt of attempts) {
    const owner = enrollmentOwners.get(attempt.enrollmentId);
    if (!owner) continue;
    const items = attemptsByStudent.get(owner) ?? [];
    items.push(attempt);
    attemptsByStudent.set(owner, items);
  }
  return new Map(students.map((student) => {
    const applications = scholarshipsByStudent.get(student.id);
    const history = (attemptsByStudent.get(student.id) ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const codeHistory = history.filter((a) => a.promotionCode?.trim().toUpperCase() === MINISTER_CODE);
    const ownEnrollments = enrollmentsByStudent.get(student.id) ?? [];
    const manual = ownEnrollments.filter((e) => e.provider === "manual" && (e.activatedAt || e.status === "active"));
    const legacy = ownEnrollments.filter((e) => e.provider === "stripe" && !history.some((a) => a.enrollmentId === e.id));
    const paymentActivity = history.some((a) => a.paidAmountMinor > 0 || !a.promotionCode || a.discountAmountMinor === 0) || manual.length > 0 || legacy.length > 0;
    // Primary-group precedence follows the team's requested order. Independent
    // evidence columns retain overlaps instead of hiding later activity.
    const group: RegistrationGroup = applications?.size ? "scholarship" : codeHistory.length ? "minister-code" : paymentActivity ? "payment" : "others";
    return [student.id, {
      group,
      scholarshipStatuses: applications ? [...applications].sort().join(", ") : "No application recorded",
      ministerCodeRecorded: codeHistory.length > 0,
      ministerCodeStatus: codeHistory.length ? [...new Set(codeHistory.map(paymentEvidenceLabel))].join("; ") : "Not recorded",
      checkoutCount: history.length,
      paymentActivity,
      paymentDetails: [
        ...history.map((a) => `${a.updatedAt}: ${paymentEvidenceLabel(a)}${a.promotionCode ? `; code ${a.promotionCode}` : ""}`),
        ...manual.map((e) => `Manual activation (${e.status}); verify receipt with KTI`),
        ...legacy.map((e) => `Stripe enrollment (${e.status}); payment history unavailable`),
      ].join("\n") || "No payment or checkout activity recorded",
    }];
  }));
}
