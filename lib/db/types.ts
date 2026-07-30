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

export type EnrollmentStatus = "pending" | "active" | "canceled" | "refunded";

export type Student = {
  id: string;
  email: string;
  fullName: string;
  country: string;
  /** scrypt hash — see lib/auth.ts. Never leaves the server. */
  passwordHash: string;
  createdAt: string;
};

export type Enrollment = {
  id: string;
  studentId: string;
  /** "advanced" for the full program, or a module slug for a single certificate. */
  product: string;
  plan: Plan;
  status: EnrollmentStatus;
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

/** A contribution to an enrolled module's asynchronous discussion group. */
export type CommunityPost = {
  id: string;
  moduleSlug: string;
  studentId: string;
  body: string;
  /** Tracked separately from assessment marks for instructor extra-credit review. */
  engagementCredits: number;
  createdAt: string;
};

export type CommunityEngagement = {
  posts: number;
  credits: number;
};

export type NewStudent = Omit<Student, "id" | "createdAt">;
export type NewEnrollment = Omit<Enrollment, "id" | "createdAt">;
export type NewCommunityPost = Omit<CommunityPost, "id" | "createdAt" | "engagementCredits">;

/**
 * Thrown when the store cannot persist — most often the dev file adapter
 * running on a host with a read-only filesystem (Vercel, Netlify, Lambda).
 *
 * Callers should catch this and tell the student enrollment is not open yet,
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

  // enrollments
  createEnrollment(input: NewEnrollment): Promise<Enrollment>;
  getEnrollmentsForStudent(studentId: string): Promise<Enrollment[]>;
  activateEnrollment(id: string, providerRef: string): Promise<Enrollment | null>;

  // progress
  markLessonComplete(studentId: string, lessonId: string): Promise<void>;
  clearLessonComplete(studentId: string, lessonId: string): Promise<void>;
  getProgress(studentId: string): Promise<ProgressRecord[]>;

  // community engagement
  createCommunityPost(input: NewCommunityPost): Promise<CommunityPost>;
  getCommunityPosts(moduleSlug: string): Promise<CommunityPost[]>;
  getCommunityEngagement(studentId: string): Promise<CommunityEngagement>;
}
