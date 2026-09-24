import type { Enrollment, ScholarshipApplication } from "./db/types";

export const MINISTER_CODE = "ORDAINEDMINISTERS2026";
/** Reserved documentation/test addresses are retained in the database, never mailed. */
export function isInternalRegistration(student: { email: string }): boolean {
  const domain = student.email.trim().toLowerCase().split("@")[1] ?? "";
  return ["example.com", "example.net", "example.org", "localhost"].includes(domain) || domain.endsWith(".test") || domain.endsWith(".invalid");
}
export const REGISTRATION_GROUPS = [
  { key: "ministers", label: "Ordained ministers" },
  { key: "scholarship", label: "Scholarship applicants" },
  { key: "paid", label: "Confirmed paid" },
  { key: "payment-pending", label: "Payment attempted / pending" },
  { key: "not-started", label: "Not started payment" },
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
  groupReason: string;
  communicationNote: string;
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
    const paymentActivity = history.length > 0 || manual.length > 0 || legacy.length > 0;
    const ministerWaiver = ownEnrollments.some((e) => e.provider === "minister-waiver" && e.status === "active" && !e.accessSuspendedAt);
    const completedMinisterCode = codeHistory.some((a) => a.status === "paid" && a.paidAmountMinor === 0 && a.discountAmountMinor > 0 && !a.needsReview && ownEnrollments.some((e) => e.id === a.enrollmentId && e.status === "active" && !e.accessSuspendedAt));
    const confirmedPayment = history.some((a) => a.status === "paid" && a.paidAmountMinor > 0 && a.refundedAmountMinor === 0 && !a.needsReview);
    const paymentReview = history.some((a) => a.needsReview || ["refunded", "partially-refunded", "disputed"].includes(a.status)) || ownEnrollments.some((e) => e.accessSuspendedAt);
    // Exactly one outreach group per registered account. Historical overlaps are
    // evidence only, never extra recipients in another group's export.
    const group: RegistrationGroup = ministerWaiver || completedMinisterCode ? "ministers"
      : applications?.size ? "scholarship"
      : confirmedPayment && !paymentReview ? "paid"
      : paymentActivity ? "payment-pending" : "not-started";
    const groupReason = group === "ministers" ? ministerWaiver ? "Verified minister tuition waiver" : "Completed, validated minister-code enrollment"
      : group === "scholarship" ? "Scholarship application on record; minister priority checked first"
      : group === "paid" ? "Positive completed Stripe payment with no refund, dispute or review flag"
      : group === "payment-pending" ? "Checkout/payment activity without confirmed payment clearance"
      : "No recorded checkout or payment activity";
    const communicationNote = group === "ministers" ? "Minister welcome only; exclude from tuition-payment and scholarship-fee requests."
      : group === "scholarship" ? "Scholarship communication only; check the decision before claiming an award or requesting any commitment fee."
      : group === "paid" ? "Payment acknowledgement; do not send a pending-payment reminder."
      : paymentReview || manual.length || legacy.length || ownEnrollments.some((e) => e.status === "active") || codeHistory.length
        ? "HOLD: staff must reconcile access, code or payment evidence before requesting payment."
        : group === "payment-pending" ? "Payment follow-up; check for a newer payment before sending."
        : "Registration follow-up; no payment attempt is recorded. Check account role before outreach.";
    return [student.id, {
      group,
      groupReason,
      communicationNote,
      scholarshipStatuses: applications ? [...applications].sort().join(", ") : "No application recorded",
      ministerCodeRecorded: codeHistory.length > 0,
      ministerCodeStatus: codeHistory.length ? [...new Set(codeHistory.map(paymentEvidenceLabel))].join("; ") : "Not recorded",
      checkoutCount: history.length,
      paymentActivity,
      paymentDetails: [
        ...ownEnrollments.filter((e) => e.provider === "minister-waiver").map((e) => `Minister tuition waiver (${e.status}${e.accessSuspendedAt ? "; access suspended" : ""}); no cash payment implied`),
        ...history.map((a) => `${a.updatedAt}: ${paymentEvidenceLabel(a)}${a.promotionCode ? `; code ${a.promotionCode}` : ""}`),
        ...manual.map((e) => `Manual activation (${e.status}); verify receipt with KTI`),
        ...legacy.map((e) => `Stripe enrollment (${e.status}); payment history unavailable`),
      ].join("\n") || "No payment or checkout activity recorded",
    }];
  }));
}
