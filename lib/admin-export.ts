import type { Enrollment, ScholarshipApplication, Student } from "./db/types";

// Applicant-authored text must never execute as an Excel formula.
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
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
