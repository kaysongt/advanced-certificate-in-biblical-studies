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

/**
 * Thrown when the store cannot persist — most often the dev file adapter
 * running on a host with a read-only filesystem (Vercel, Netlify, Lambda).
 *
 * Callers should catch this and tell the student enrolment is not open yet,
 * rather than surfacing a 500. It disappears once a real database is attached
 * in lib/db/index.ts.
 */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      "Persistent storage is unavailable. The file-backed dev adapter cannot " +
        "write on this host. Attach a real database in lib/db/index.ts."
    );
    this.name = "StorageUnavailableError";
    this.cause = cause;
  }
}

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
