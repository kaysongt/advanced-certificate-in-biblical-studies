/**
 * Storage contract for the site.
 *
 * Everything the app does with persisted data goes through `DataStore`. To move
 * onto a real database, implement this interface once and swap the export in
 * `lib/db/index.ts` — no page, route, or action needs to change.
 *
 * The shape mirrors the schema in HANDOVER.md §4.4.
 */

export type Plan = "certificate" | "advanced";

export type EnrolmentStatus = "pending" | "active" | "cancelled" | "refunded";

export type Student = {
  id: string;
  email: string;
  fullName: string;
  country: string;
  /** scrypt hash — see lib/auth.ts. Never leaves the server. */
  passwordHash: string;
  createdAt: string;
};

export type Enrolment = {
  id: string;
  studentId: string;
  /** "advanced" for the full programme, or a module slug for a single certificate. */
  product: string;
  plan: Plan;
  status: EnrolmentStatus;
  amount: number;
  currency: string;
  /** "stripe" | "paystack" | "manual" — set when payment is wired up. */
  provider: string | null;
  providerRef: string | null;
  createdAt: string;
};

export type ProgressRecord = {
  studentId: string;
  /** Matches the existing lesson id format: "{course-slug}-{n}", e.g. "st-101-1". */
  lessonId: string;
  completedAt: string;
};

export type NewStudent = Omit<Student, "id" | "createdAt">;
export type NewEnrolment = Omit<Enrolment, "id" | "createdAt">;

export interface DataStore {
  // students
  createStudent(input: NewStudent): Promise<Student>;
  getStudentByEmail(email: string): Promise<Student | null>;
  getStudentById(id: string): Promise<Student | null>;

  // enrolments
  createEnrolment(input: NewEnrolment): Promise<Enrolment>;
  getEnrolmentsForStudent(studentId: string): Promise<Enrolment[]>;
  activateEnrolment(id: string, providerRef: string): Promise<Enrolment | null>;

  // progress
  markLessonComplete(studentId: string, lessonId: string): Promise<void>;
  clearLessonComplete(studentId: string, lessonId: string): Promise<void>;
  getProgress(studentId: string): Promise<ProgressRecord[]>;
}
