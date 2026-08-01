import {
  AssessmentStatus as PrismaAssessmentStatus,
  EnrollmentPlan as PrismaEnrollmentPlan,
  EnrollmentStatus as PrismaEnrollmentStatus,
  Prisma,
  QuizKind as PrismaQuizKind,
  StudentRole as PrismaStudentRole,
} from "@prisma/client";

import { prisma } from "./prisma";
import type {
  AssessmentStatus,
  AssessmentSubmission,
  CommunityPost,
  DataStore,
  Enrollment,
  EnrollmentStatus,
  Plan,
  QuizAttempt,
  QuizKind,
  Student,
  StudentRole,
} from "./types";

const roleToPrisma: Record<StudentRole, PrismaStudentRole> = {
  student: PrismaStudentRole.STUDENT,
  staff: PrismaStudentRole.STAFF,
  admin: PrismaStudentRole.ADMIN,
};

const roleFromPrisma: Record<PrismaStudentRole, StudentRole> = {
  STUDENT: "student",
  STAFF: "staff",
  ADMIN: "admin",
};

const planToPrisma: Record<Plan, PrismaEnrollmentPlan> = {
  certificate: PrismaEnrollmentPlan.CERTIFICATE,
  advanced: PrismaEnrollmentPlan.ADVANCED,
};

const planFromPrisma: Record<PrismaEnrollmentPlan, Plan> = {
  CERTIFICATE: "certificate",
  ADVANCED: "advanced",
};

const enrollmentStatusFromPrisma: Record<PrismaEnrollmentStatus, EnrollmentStatus> = {
  PENDING: "pending",
  ACTIVE: "active",
  CANCELED: "canceled",
  REFUNDED: "refunded",
};

const quizKindToPrisma: Record<QuizKind, PrismaQuizKind> = {
  topic: PrismaQuizKind.TOPIC,
  "course-assessment": PrismaQuizKind.COURSE_ASSESSMENT,
};

const quizKindFromPrisma: Record<PrismaQuizKind, QuizKind> = {
  TOPIC: "topic",
  COURSE_ASSESSMENT: "course-assessment",
};

const assessmentStatusFromPrisma: Record<PrismaAssessmentStatus, AssessmentStatus> = {
  IN_PROGRESS: "in-progress",
  PENDING_REVIEW: "pending-review",
  GRADED: "graded",
};

type PrismaStudent = Awaited<ReturnType<typeof prisma.student.findUniqueOrThrow>>;
type PrismaEnrollment = Awaited<ReturnType<typeof prisma.enrollment.findUniqueOrThrow>>;
type PrismaQuizAttempt = Awaited<ReturnType<typeof prisma.quizAttempt.findUniqueOrThrow>>;
type PrismaAssessment = Awaited<ReturnType<typeof prisma.assessmentSubmission.findUniqueOrThrow>>;
type PrismaCommunityPost = Awaited<ReturnType<typeof prisma.communityPost.findUniqueOrThrow>>;

function mapStudent(student: PrismaStudent): Student {
  return {
    id: student.id,
    email: student.email,
    fullName: student.fullName,
    country: student.country,
    passwordHash: student.passwordHash,
    role: roleFromPrisma[student.role],
    createdAt: student.createdAt.toISOString(),
  };
}

function mapEnrollment(enrollment: PrismaEnrollment): Enrollment {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    product: enrollment.product,
    plan: planFromPrisma[enrollment.plan],
    status: enrollmentStatusFromPrisma[enrollment.status],
    amount: enrollment.amount,
    currency: enrollment.currency,
    provider: enrollment.provider,
    providerRef: enrollment.providerRef,
    createdAt: enrollment.createdAt.toISOString(),
  };
}

function mapQuizAttempt(attempt: PrismaQuizAttempt): QuizAttempt {
  return {
    id: attempt.id,
    studentId: attempt.studentId,
    courseSlug: attempt.courseSlug,
    lessonId: attempt.lessonId,
    kind: quizKindFromPrisma[attempt.kind],
    correct: attempt.correct,
    total: attempt.total,
    scorePct: attempt.scorePct,
    passed: attempt.passed,
    createdAt: attempt.createdAt.toISOString(),
  };
}

function mapAssessment(submission: PrismaAssessment): AssessmentSubmission {
  return {
    id: submission.id,
    studentId: submission.studentId,
    courseSlug: submission.courseSlug,
    sectionACorrect: submission.sectionACorrect,
    sectionATotal: submission.sectionATotal,
    sectionAPoints: submission.sectionAPoints,
    writtenResponse: submission.writtenResponse,
    writtenPoints: submission.writtenPoints,
    totalScore: submission.totalScore,
    status: assessmentStatusFromPrisma[submission.status],
    feedback: submission.feedback,
    gradedById: submission.gradedById,
    gradedAt: submission.gradedAt?.toISOString() ?? null,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
  };
}

function mapCommunityPost(post: PrismaCommunityPost): CommunityPost {
  return {
    id: post.id,
    moduleSlug: post.moduleSlug,
    studentId: post.studentId,
    body: post.body,
    engagementCredits: post.engagementCredits,
    createdAt: post.createdAt.toISOString(),
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const prismaStore: DataStore = {
  async createStudent(input) {
    return mapStudent(
      await prisma.student.create({
        data: {
          email: input.email.trim().toLowerCase(),
          fullName: input.fullName,
          country: input.country,
          passwordHash: input.passwordHash,
          role: roleToPrisma[input.role ?? "student"],
        },
      })
    );
  },

  async createStudentWithEnrollment(studentInput, enrollmentInput) {
    const result = await prisma.$transaction(async (transaction) => {
      const student = await transaction.student.create({
        data: {
          email: studentInput.email.trim().toLowerCase(),
          fullName: studentInput.fullName,
          country: studentInput.country,
          passwordHash: studentInput.passwordHash,
          role: roleToPrisma[studentInput.role ?? "student"],
        },
      });
      const enrollment = await transaction.enrollment.create({
        data: {
          studentId: student.id,
          product: enrollmentInput.product,
          plan: planToPrisma[enrollmentInput.plan],
          status: PrismaEnrollmentStatus.PENDING,
          amount: enrollmentInput.amount,
          currency: enrollmentInput.currency,
          provider: enrollmentInput.provider,
          providerRef: enrollmentInput.providerRef,
        },
      });
      return { student, enrollment };
    });

    return {
      student: mapStudent(result.student),
      enrollment: mapEnrollment(result.enrollment),
    };
  },

  async getStudentByEmail(email) {
    const student = await prisma.student.findUnique({ where: { email: email.trim().toLowerCase() } });
    return student ? mapStudent(student) : null;
  },

  async getStudentById(id) {
    const student = await prisma.student.findUnique({ where: { id } });
    return student ? mapStudent(student) : null;
  },

  async createEnrollment(input) {
    return mapEnrollment(
      await prisma.enrollment.create({
        data: {
          studentId: input.studentId,
          product: input.product,
          plan: planToPrisma[input.plan],
          status: PrismaEnrollmentStatus.PENDING,
          amount: input.amount,
          currency: input.currency,
          provider: input.provider,
          providerRef: input.providerRef,
        },
      })
    );
  },

  async getEnrollmentsForStudent(studentId) {
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    });
    return enrollments.map(mapEnrollment);
  },

  async activateEnrollment(id, providerRef, provider = "manual") {
    const existing = await prisma.enrollment.findUnique({ where: { id } });
    if (!existing) return null;
    return mapEnrollment(
      await prisma.enrollment.update({
        where: { id },
        data: { status: PrismaEnrollmentStatus.ACTIVE, provider, providerRef },
      })
    );
  },

  async listEnrollments() {
    const enrollments = await prisma.enrollment.findMany({
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
    return enrollments.map(({ student, ...enrollment }) => ({
      ...mapEnrollment(enrollment),
      student: mapStudent(student),
    }));
  },

  async listPendingEnrollments() {
    const enrollments = await prisma.enrollment.findMany({
      where: { status: PrismaEnrollmentStatus.PENDING },
      include: { student: true },
      orderBy: { createdAt: "asc" },
    });
    return enrollments.map(({ student, ...enrollment }) => ({
      ...mapEnrollment(enrollment),
      student: mapStudent(student),
    }));
  },

  async markLessonComplete(studentId, lessonId) {
    await prisma.progress.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      update: {},
      create: { studentId, lessonId },
    });
  },

  async clearLessonComplete(studentId, lessonId) {
    await prisma.progress.deleteMany({ where: { studentId, lessonId } });
  },

  async getProgress(studentId) {
    const progress = await prisma.progress.findMany({
      where: { studentId },
      orderBy: { completedAt: "asc" },
    });
    return progress.map((item) => ({
      studentId: item.studentId,
      lessonId: item.lessonId,
      completedAt: item.completedAt.toISOString(),
    }));
  },

  async createQuizAttempt(input) {
    return mapQuizAttempt(
      await prisma.quizAttempt.create({
        data: {
          studentId: input.studentId,
          courseSlug: input.courseSlug,
          lessonId: input.lessonId,
          kind: quizKindToPrisma[input.kind],
          correct: input.correct,
          total: input.total,
          scorePct: input.scorePct,
          passed: input.passed,
          answers: jsonValue(input.answers),
        },
      })
    );
  },

  async hasPassingTopicAttempt(studentId, lessonId) {
    return Boolean(
      await prisma.quizAttempt.findFirst({
        where: { studentId, lessonId, kind: PrismaQuizKind.TOPIC, passed: true },
        select: { id: true },
      })
    );
  },

  async createAssessmentSubmission(input) {
    return mapAssessment(await prisma.assessmentSubmission.create({ data: input }));
  },

  async submitAssessmentWrittenWork(id, studentId, response) {
    const updated = await prisma.assessmentSubmission.updateMany({
      where: { id, studentId, status: PrismaAssessmentStatus.IN_PROGRESS },
      data: { writtenResponse: response, status: PrismaAssessmentStatus.PENDING_REVIEW },
    });
    if (!updated.count) return null;
    return mapAssessment(await prisma.assessmentSubmission.findUniqueOrThrow({ where: { id } }));
  },

  async getLatestAssessmentSubmission(studentId, courseSlug) {
    const submission = await prisma.assessmentSubmission.findFirst({
      where: { studentId, courseSlug },
      orderBy: { createdAt: "desc" },
    });
    return submission ? mapAssessment(submission) : null;
  },

  async listPendingAssessments() {
    const submissions = await prisma.assessmentSubmission.findMany({
      where: { status: PrismaAssessmentStatus.PENDING_REVIEW },
      include: { student: true },
      orderBy: { createdAt: "asc" },
    });
    return submissions.map(({ student, ...submission }) => ({
      ...mapAssessment(submission),
      student: mapStudent(student),
    }));
  },

  async gradeAssessment(input) {
    const existing = await prisma.assessmentSubmission.findUnique({ where: { id: input.id } });
    if (!existing) return null;
    return mapAssessment(
      await prisma.assessmentSubmission.update({
        where: { id: input.id },
        data: {
          writtenPoints: input.writtenPoints,
          totalScore: existing.sectionAPoints + input.writtenPoints,
          feedback: input.feedback,
          gradedById: input.graderId,
          gradedAt: new Date(),
          status: PrismaAssessmentStatus.GRADED,
        },
      })
    );
  },

  async createCommunityPost(input) {
    return mapCommunityPost(await prisma.communityPost.create({ data: input }));
  },

  async getCommunityPosts(moduleSlug) {
    const posts = await prisma.communityPost.findMany({
      where: { moduleSlug, hiddenAt: null },
      orderBy: { createdAt: "desc" },
    });
    return posts.map(mapCommunityPost);
  },

  async getCommunityEngagement(studentId) {
    const result = await prisma.communityPost.aggregate({
      where: { studentId, hiddenAt: null },
      _count: { id: true },
      _sum: { engagementCredits: true },
    });
    return { posts: result._count.id, credits: result._sum.engagementCredits ?? 0 };
  },

  async moderateCommunityPost(input) {
    const existing = await prisma.communityPost.findUnique({ where: { id: input.postId } });
    if (!existing) return null;
    return mapCommunityPost(
      await prisma.communityPost.update({
        where: { id: input.postId },
        data: {
          hiddenAt: input.hidden ? new Date() : null,
          moderatedById: input.moderatorId,
          engagementCredits: input.engagementCredits,
        },
      })
    );
  },

  async listRecentCommunityPosts() {
    const posts = await prisma.communityPost.findMany({
      where: { hiddenAt: null },
      include: { student: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return posts.map(({ student, ...post }) => ({
      ...mapCommunityPost(post),
      student: mapStudent(student),
    }));
  },
};
