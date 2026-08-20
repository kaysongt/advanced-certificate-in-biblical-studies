import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { StorageUnavailableError } from "./types";
import type {
  AssessmentSubmission,
  CommunityEngagement,
  CommunityPost,
  DataStore,
  Enrollment,
  NewCommunityPost,
  NewEnrollment,
  NewEnrollmentForStudent,
  NewScholarshipApplication,
  NewStudent,
  ProgressRecord,
  QuizAttempt,
  ScholarshipApplication,
  Student,
  StudentRole,
} from "./types";

/** Development-only persistence used when DATABASE_URL is absent. */

type StoredCommunityPost = CommunityPost & {
  hiddenAt: string | null;
  moderatedById: string | null;
};

type Shape = {
  students: Student[];
  enrollments: Enrollment[];
  progress: ProgressRecord[];
  quizAttempts: QuizAttempt[];
  assessmentSubmissions: AssessmentSubmission[];
  communityPosts: StoredCommunityPost[];
  scholarshipApplications: ScholarshipApplication[];
};

const FILE = path.join(process.cwd(), ".data", "store.json");
const EMPTY: Shape = {
  students: [],
  enrollments: [],
  progress: [],
  quizAttempts: [],
  assessmentSubmissions: [],
  communityPosts: [],
  scholarshipApplications: [],
};

async function read(): Promise<Shape> {
  try {
    return { ...EMPTY, ...JSON.parse(await fs.readFile(FILE, "utf8")) };
  } catch {
    return { ...EMPTY };
  }
}

async function write(data: Shape): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    throw new StorageUnavailableError(error);
  }
}

const normalize = (email: string) => email.trim().toLowerCase();

// The file adapter is development-only, but concurrent server actions can still
// arrive in the same process. Serialize scholarship review read-modify-write
// cycles so two staff decisions cannot both accept the same pending record.
let scholarshipReviewLock: Promise<void> = Promise.resolve();

async function withScholarshipReviewLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = scholarshipReviewLock;
  let release!: () => void;
  scholarshipReviewLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export const fileStore: DataStore = {
  async createStudent(input: NewStudent): Promise<Student> {
    const data = await read();
    const student: Student = {
      ...input,
      email: normalize(input.email),
      role: input.role ?? "student",
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data.students.push(student);
    await write(data);
    return student;
  },

  async createStudentWithEnrollment(
    studentInput: NewStudent,
    enrollmentInput: NewEnrollmentForStudent
  ): Promise<{ student: Student; enrollment: Enrollment }> {
    const data = await read();
    const student: Student = {
      ...studentInput,
      email: normalize(studentInput.email),
      role: studentInput.role ?? "student",
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const enrollment: Enrollment = {
      ...enrollmentInput,
      studentId: student.id,
      id: randomUUID(),
      activatedAt: null,
      accessSuspendedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.students.push(student);
    data.enrollments.push(enrollment);
    await write(data);
    return { student, enrollment };
  },

  async getStudentByEmail(email: string): Promise<Student | null> {
    const data = await read();
    return data.students.find((student) => student.email === normalize(email)) ?? null;
  },

  async getStudentById(id: string): Promise<Student | null> {
    const data = await read();
    return data.students.find((student) => student.id === id) ?? null;
  },

  async listStudents(): Promise<Student[]> {
    const data = await read();
    return [...data.students].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async updateStudentPassword(studentId: string, passwordHash: string): Promise<void> {
    const data = await read();
    const student = data.students.find((candidate) => candidate.id === studentId);
    if (!student) return;
    student.passwordHash = passwordHash;
    await write(data);
  },

  async updateStudentRole(studentId: string, role: StudentRole): Promise<void> {
    const data = await read();
    const student = data.students.find((candidate) => candidate.id === studentId);
    if (!student) return;
    student.role = role;
    await write(data);
  },

  async createEnrollment(input: NewEnrollment): Promise<Enrollment> {
    const data = await read();
    const enrollment: Enrollment = {
      ...input,
      id: randomUUID(),
      activatedAt: null,
      accessSuspendedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.enrollments.push(enrollment);
    await write(data);
    return enrollment;
  },

  async getEnrollmentsForStudent(studentId: string): Promise<Enrollment[]> {
    const data = await read();
    return data.enrollments.filter((enrollment) => enrollment.studentId === studentId);
  },

  async activateEnrollment(
    id: string,
    providerRef: string,
    provider = "manual"
  ): Promise<Enrollment | null> {
    const data = await read();
    const found = data.enrollments.find((enrollment) => enrollment.id === id);
    if (!found || found.status !== "pending") return null;
    found.status = "active";
    found.provider = provider;
    found.providerRef = providerRef;
    found.activatedAt = new Date().toISOString();
    found.accessSuspendedAt = null;
    found.updatedAt = new Date().toISOString();
    await write(data);
    return found;
  },

  async listStaff(): Promise<Student[]> {
    const data = await read();
    return data.students
      .filter((student) => student.role === "staff" || student.role === "admin")
      .sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName));
  },

  async listEnrollments(): Promise<(Enrollment & { student: Student })[]> {
    const data = await read();
    return data.enrollments
      .flatMap((enrollment) => {
        const student = data.students.find((candidate) => candidate.id === enrollment.studentId);
        return student ? [{ ...enrollment, student }] : [];
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  async listPendingEnrollments(): Promise<(Enrollment & { student: Student })[]> {
    const data = await read();
    return data.enrollments.flatMap((enrollment) => {
      const student = data.students.find((candidate) => candidate.id === enrollment.studentId);
      return enrollment.status === "pending" && student ? [{ ...enrollment, student }] : [];
    });
  },

  async createScholarshipApplication(
    input: NewScholarshipApplication
  ): Promise<ScholarshipApplication | null> {
    const data = await read();
    const enrollment = data.enrollments.find(
      (item) =>
        item.id === input.enrollmentId &&
        item.studentId === input.studentId &&
        item.status === "pending"
    );
    if (
      !enrollment ||
      input.amountAbleToPay < 0 ||
      input.amountAbleToPay > enrollment.amount
    ) {
      return null;
    }
    const existing = data.scholarshipApplications.find(
      (item) => item.enrollmentId === input.enrollmentId
    );
    if (existing) return existing;

    const now = new Date().toISOString();
    const application: ScholarshipApplication = {
      ...input,
      id: randomUUID(),
      status: "pending",
      adminNotes: null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    data.scholarshipApplications.push(application);
    await write(data);
    return application;
  },

  async getScholarshipApplicationForEnrollment(enrollmentId, studentId) {
    const data = await read();
    return (
      data.scholarshipApplications.find(
        (item) => item.enrollmentId === enrollmentId && item.studentId === studentId
      ) ?? null
    );
  },

  async getScholarshipApplicationsForStudent(studentId) {
    const data = await read();
    return data.scholarshipApplications
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async listScholarshipApplications() {
    const data = await read();
    return data.scholarshipApplications
      .slice()
      .sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .flatMap((application) => {
        const student = data.students.find((item) => item.id === application.studentId);
        const enrollment = data.enrollments.find((item) => item.id === application.enrollmentId);
        return student && enrollment ? [{ ...application, student, enrollment }] : [];
      });
  },

  async countPendingScholarshipApplications() {
    const data = await read();
    return data.scholarshipApplications.filter((item) => item.status === "pending").length;
  },

  async reviewScholarshipApplication(input) {
    return withScholarshipReviewLock(async () => {
      const data = await read();
      const application = data.scholarshipApplications.find(
        (item) => item.id === input.applicationId && item.status === "pending"
      );
      const reviewer = data.students.find(
        (item) => item.id === input.reviewerId && (item.role === "staff" || item.role === "admin")
      );
      if (!application || !reviewer) return null;

      const enrollment = data.enrollments.find((item) => item.id === application.enrollmentId);
      if (input.decision === "approved") {
        if (!enrollment || enrollment.status !== "pending") return null;
        enrollment.status = "active";
        enrollment.provider = "scholarship";
        enrollment.providerRef = application.id;
        enrollment.activatedAt = new Date().toISOString();
        enrollment.accessSuspendedAt = null;
        enrollment.updatedAt = new Date().toISOString();
      }

      const now = new Date().toISOString();
      application.status = input.decision;
      application.adminNotes = input.adminNotes.trim() || null;
      application.reviewedById = reviewer.id;
      application.reviewedAt = now;
      application.updatedAt = now;
      await write(data);
      return application;
    });
  },

  async markLessonComplete(studentId: string, lessonId: string): Promise<void> {
    const data = await read();
    if (!data.progress.some((item) => item.studentId === studentId && item.lessonId === lessonId)) {
      data.progress.push({ studentId, lessonId, completedAt: new Date().toISOString() });
      await write(data);
    }
  },

  async clearLessonComplete(studentId: string, lessonId: string): Promise<void> {
    const data = await read();
    const next = data.progress.filter(
      (item) => !(item.studentId === studentId && item.lessonId === lessonId)
    );
    if (next.length !== data.progress.length) {
      data.progress = next;
      await write(data);
    }
  },

  async getProgress(studentId: string): Promise<ProgressRecord[]> {
    const data = await read();
    return data.progress.filter((item) => item.studentId === studentId);
  },

  async createQuizAttempt(input): Promise<QuizAttempt> {
    const data = await read();
    const attempt: QuizAttempt = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data.quizAttempts.push(attempt);
    await write(data);
    return attempt;
  },

  async hasPassingTopicAttempt(studentId: string, lessonId: string): Promise<boolean> {
    const data = await read();
    return data.quizAttempts.some(
      (attempt) =>
        attempt.studentId === studentId &&
        attempt.lessonId === lessonId &&
        attempt.kind === "topic" &&
        attempt.passed
    );
  },

  async createAssessmentSubmission(input): Promise<AssessmentSubmission> {
    const data = await read();
    const now = new Date().toISOString();
    const submission: AssessmentSubmission = {
      ...input,
      id: randomUUID(),
      writtenResponse: null,
      writtenPoints: null,
      totalScore: null,
      status: "in-progress",
      feedback: null,
      gradedById: null,
      gradedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    data.assessmentSubmissions.push(submission);
    await write(data);
    return submission;
  },

  async submitAssessmentWrittenWork(id, studentId, response) {
    const data = await read();
    const submission = data.assessmentSubmissions.find(
      (item) => item.id === id && item.studentId === studentId
    );
    if (!submission) return null;
    submission.writtenResponse = response;
    submission.status = "pending-review";
    submission.updatedAt = new Date().toISOString();
    await write(data);
    return submission;
  },

  async getLatestAssessmentSubmission(studentId, courseSlug) {
    const data = await read();
    return (
      data.assessmentSubmissions
        .filter((item) => item.studentId === studentId && item.courseSlug === courseSlug)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  },

  async listPendingAssessments() {
    const data = await read();
    return data.assessmentSubmissions.flatMap((submission) => {
      const student = data.students.find((candidate) => candidate.id === submission.studentId);
      return submission.status === "pending-review" && student ? [{ ...submission, student }] : [];
    });
  },

  async gradeAssessment(input) {
    const data = await read();
    const submission = data.assessmentSubmissions.find((item) => item.id === input.id);
    if (!submission) return null;
    const now = new Date().toISOString();
    submission.writtenPoints = input.writtenPoints;
    submission.totalScore = submission.sectionAPoints + input.writtenPoints;
    submission.feedback = input.feedback;
    submission.gradedById = input.graderId;
    submission.gradedAt = now;
    submission.updatedAt = now;
    submission.status = "graded";
    await write(data);
    return submission;
  },

  async createCommunityPost(input: NewCommunityPost): Promise<CommunityPost> {
    const data = await read();
    const post: StoredCommunityPost = {
      ...input,
      id: randomUUID(),
      engagementCredits: 0,
      hiddenAt: null,
      moderatedById: null,
      createdAt: new Date().toISOString(),
    };
    data.communityPosts.push(post);
    await write(data);
    return post;
  },

  async getCommunityPosts(moduleSlug: string): Promise<CommunityPost[]> {
    const data = await read();
    return data.communityPosts
      .filter((post) => post.moduleSlug === moduleSlug && !post.hiddenAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getCommunityEngagement(studentId: string): Promise<CommunityEngagement> {
    const data = await read();
    const posts = data.communityPosts.filter(
      (post) => post.studentId === studentId && !post.hiddenAt
    );
    return {
      posts: posts.length,
      credits: posts.reduce((total, post) => total + post.engagementCredits, 0),
    };
  },

  async moderateCommunityPost(input): Promise<CommunityPost | null> {
    const data = await read();
    const post = data.communityPosts.find((item) => item.id === input.postId);
    if (!post) return null;
    post.hiddenAt = input.hidden ? new Date().toISOString() : null;
    post.moderatedById = input.moderatorId;
    post.engagementCredits = input.engagementCredits;
    await write(data);
    return post;
  },

  async listRecentCommunityPosts() {
    const data = await read();
    return data.communityPosts
      .filter((post) => !post.hiddenAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
      .flatMap((post) => {
        const student = data.students.find((candidate) => candidate.id === post.studentId);
        return student ? [{ ...post, student }] : [];
      });
  },
};
