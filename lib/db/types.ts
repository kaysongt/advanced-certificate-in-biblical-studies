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

export type StudentRole = "student" | "staff" | "admin";

export type EnrollmentStatus = "pending" | "active" | "canceled" | "refunded";

export type Student = {
  id: string;
  email: string;
  fullName: string;
  country: string;
  /** scrypt hash — see lib/auth.ts. Never leaves the server. */
  passwordHash: string;
  role: StudentRole;
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
  activatedAt: string | null;
  /** A disputed Stripe payment can suspend access without erasing the enrollment. */
  accessSuspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScholarshipStatus = "pending" | "approved" | "declined";

export type ScholarshipApplication = {
  id: string;
  enrollmentId: string;
  studentId: string;
  financialNeed: string;
  trainingGoals: string;
  /** Whole US dollars the applicant says they could contribute. */
  amountAbleToPay: number;
  status: ScholarshipStatus;
  /** Private staff notes. Never shown to the applicant. */
  adminNotes: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export type QuizKind = "topic" | "course-assessment";

export type QuizAttempt = {
  id: string;
  studentId: string;
  courseSlug: string;
  lessonId: string | null;
  kind: QuizKind;
  correct: number;
  total: number;
  scorePct: number;
  passed: boolean;
  createdAt: string;
};

export type AssessmentStatus = "in-progress" | "pending-review" | "graded";

export type AssessmentSubmission = {
  id: string;
  studentId: string;
  courseSlug: string;
  sectionACorrect: number;
  sectionATotal: number;
  sectionAPoints: number;
  writtenResponse: string | null;
  writtenPoints: number | null;
  totalScore: number | null;
  status: AssessmentStatus;
  feedback: string | null;
  gradedById: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommunityEngagement = {
  posts: number;
  credits: number;
};

export type NewStudent = Omit<Student, "id" | "createdAt" | "role"> & { role?: StudentRole };
export type NewEnrollment = Omit<
  Enrollment,
  "id" | "createdAt" | "updatedAt" | "activatedAt" | "accessSuspendedAt"
>;
export type NewEnrollmentForStudent = Omit<NewEnrollment, "studentId">;
export type NewCommunityPost = Omit<CommunityPost, "id" | "createdAt" | "engagementCredits">;
export type NewScholarshipApplication = Pick<
  ScholarshipApplication,
  "enrollmentId" | "studentId" | "financialNeed" | "trainingGoals" | "amountAbleToPay"
>;

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
  createStudentWithEnrollment(
    student: NewStudent,
    enrollment: NewEnrollmentForStudent
  ): Promise<{ student: Student; enrollment: Enrollment }>;
  getStudentByEmail(email: string): Promise<Student | null>;
  getStudentById(id: string): Promise<Student | null>;

  // enrollments
  createEnrollment(input: NewEnrollment): Promise<Enrollment>;
  getEnrollmentsForStudent(studentId: string): Promise<Enrollment[]>;
  activateEnrollment(id: string, providerRef: string, provider?: string): Promise<Enrollment | null>;
  /** Everyone with staff or admin access, for the team roster on /admin. */
  listStaff(): Promise<Student[]>;
  listEnrollments(): Promise<(Enrollment & { student: Student })[]>;
  listPendingEnrollments(): Promise<(Enrollment & { student: Student })[]>;

  // scholarship applications
  createScholarshipApplication(
    input: NewScholarshipApplication
  ): Promise<ScholarshipApplication | null>;
  getScholarshipApplicationForEnrollment(
    enrollmentId: string,
    studentId: string
  ): Promise<ScholarshipApplication | null>;
  getScholarshipApplicationsForStudent(studentId: string): Promise<ScholarshipApplication[]>;
  listScholarshipApplications(): Promise<
    (ScholarshipApplication & { student: Student; enrollment: Enrollment })[]
  >;
  countPendingScholarshipApplications(): Promise<number>;
  reviewScholarshipApplication(input: {
    applicationId: string;
    reviewerId: string;
    decision: Exclude<ScholarshipStatus, "pending">;
    adminNotes: string;
  }): Promise<ScholarshipApplication | null>;

  // progress
  markLessonComplete(studentId: string, lessonId: string): Promise<void>;
  clearLessonComplete(studentId: string, lessonId: string): Promise<void>;
  getProgress(studentId: string): Promise<ProgressRecord[]>;

  // quiz and course assessment records
  createQuizAttempt(input: {
    studentId: string;
    courseSlug: string;
    lessonId: string | null;
    kind: QuizKind;
    correct: number;
    total: number;
    scorePct: number;
    passed: boolean;
    answers: unknown;
  }): Promise<QuizAttempt>;
  hasPassingTopicAttempt(studentId: string, lessonId: string): Promise<boolean>;
  createAssessmentSubmission(input: {
    studentId: string;
    courseSlug: string;
    sectionACorrect: number;
    sectionATotal: number;
    sectionAPoints: number;
  }): Promise<AssessmentSubmission>;
  submitAssessmentWrittenWork(id: string, studentId: string, response: string): Promise<AssessmentSubmission | null>;
  getLatestAssessmentSubmission(studentId: string, courseSlug: string): Promise<AssessmentSubmission | null>;
  listPendingAssessments(): Promise<(AssessmentSubmission & { student: Student })[]>;
  gradeAssessment(input: {
    id: string;
    graderId: string;
    writtenPoints: number;
    feedback: string;
  }): Promise<AssessmentSubmission | null>;

  // community engagement
  createCommunityPost(input: NewCommunityPost): Promise<CommunityPost>;
  getCommunityPosts(moduleSlug: string): Promise<CommunityPost[]>;
  getCommunityEngagement(studentId: string): Promise<CommunityEngagement>;
  moderateCommunityPost(input: {
    postId: string;
    moderatorId: string;
    hidden: boolean;
    engagementCredits: number;
  }): Promise<CommunityPost | null>;
  listRecentCommunityPosts(): Promise<(CommunityPost & { student: Student })[]>;
}
