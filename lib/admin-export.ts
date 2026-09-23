import type { Enrollment, ScholarshipApplication, Student } from "./db/types";
import { registrationGroupLabel, type RegistrationEvidence } from "./registration-groups";

// Applicant-authored text must never execute as an Excel formula.
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** One row per account, including people with no enrollment or multiple plans. */
export function registrationsCsv(
  students: Pick<Student, "id" | "fullName" | "email" | "country" | "role" | "createdAt">[],
  enrollments: Enrollment[],
  programNames: ReadonlyMap<string, string> = new Map(),
  evidence?: ReadonlyMap<string, RegistrationEvidence>,
): string {
  const byStudent = new Map<string, Enrollment[]>();
  for (const enrollment of enrollments) {
    const items = byStudent.get(enrollment.studentId) ?? [];
    items.push(enrollment);
    byStudent.set(enrollment.studentId, items);
  }
  const rows: unknown[][] = [[
    "Account ID", "Name", "Email", "Country", "Role", "Registered (UTC)",
    "Enrollment count", "Enrollments (program / status / source)",
    "Registration group", "Scholarship application status", "Minister code recorded",
    "Minister code status", "Checkout attempts", "Payment activity recorded", "Payment / checkout history",
  ]];
  for (const student of students) {
    const items = byStudent.get(student.id) ?? [];
    const details = evidence?.get(student.id);
    rows.push([
      student.id, student.fullName, student.email, student.country, student.role,
      student.createdAt, items.length,
      items.length ? items.map((item) => {
        const program = programNames.get(item.product) ?? item.product;
        const status = item.accessSuspendedAt ? `${item.status} (access suspended)` : item.status;
        return `${program} / ${status} / ${item.provider || "Not recorded"}`;
      }).join("\n") : "No enrollment",
      details ? registrationGroupLabel(details.group) : "Not classified",
      details?.scholarshipStatuses ?? "Not checked",
      details ? details.ministerCodeRecorded ? "Yes" : "No" : "Not checked",
      details?.ministerCodeStatus ?? "Not checked", details?.checkoutCount ?? "",
      details ? details.paymentActivity ? "Yes" : "No" : "Not checked",
      details?.paymentDetails ?? "Not checked",
    ]);
  }
  // Explicit allowlist above deliberately excludes password hashes and provider references.
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function scholarshipCsv(
  applications: (ScholarshipApplication & {
    student: Student;
    enrollment: Enrollment;
  })[],
): string {
  const rows: unknown[][] = [
    [
      "Application ID",
      "Name",
      "Email",
      "Country",
      "Status",
      "Submitted (UTC)",
      "Program",
      "Currency",
      "Tuition",
      "Can contribute",
      "Financial need",
      "Training goals",
      "Reviewed (UTC)",
      "Reviewer ID",
      "Private staff notes",
    ],
  ];
  for (const a of applications)
    rows.push([
      a.id,
      a.student.fullName,
      a.student.email,
      a.student.country,
      a.status,
      a.createdAt,
      a.enrollment.product,
      a.enrollment.currency,
      a.enrollment.amount,
      a.amountAbleToPay,
      a.financialNeed,
      a.trainingGoals,
      a.reviewedAt,
      a.reviewedById,
      a.adminNotes,
    ]);
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
