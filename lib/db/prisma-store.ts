import {
  AssessmentStatus as PrismaAssessmentStatus,
  EnrollmentPlan as PrismaEnrollmentPlan,
  EnrollmentStatus as PrismaEnrollmentStatus,
  Prisma,
  QuizKind as PrismaQuizKind,
  ScholarshipStatus as PrismaScholarshipStatus,
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
  ScholarshipApplication,
  ScholarshipStatus,
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

const scholarshipStatusFromPrisma: Record<PrismaScholarshipStatus, ScholarshipStatus> = {
  PENDING: "pending",
  APPROVED: "approved",
  DECLINED: "declined",
};

type PrismaStudent = Awaited<ReturnType<typeof prisma.student.findUniqueOrThrow>>;
type PrismaEnrollment = Awaited<ReturnType<typeof prisma.enrollment.findUniqueOrThrow>>;
type PrismaQuizAttempt = Awaited<ReturnType<typeof prisma.quizAttempt.findUniqueOrThrow>>;
type PrismaAssessment = Awaited<ReturnType<typeof prisma.assessmentSubmission.findUniqueOrThrow>>;
type PrismaCommunityPost = Awaited<ReturnType<typeof prisma.communityPost.findUniqueOrThrow>>;
type PrismaScholarshipApplication = Awaited<
  ReturnType<typeof prisma.scholarshipApplication.findUniqueOrThrow>
>;

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
    activatedAt: enrollment.activatedAt?.toISOString() ?? null,
    accessSuspendedAt: enrollment.accessSuspendedAt?.toISOString() ?? null,
    createdAt: enrollment.createdAt.toISOString(),
    updatedAt: enrollment.updatedAt.toISOString(),
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

function mapScholarshipApplication(
  application: PrismaScholarshipApplication
): ScholarshipApplication {
  return {
    id: application.id,
    enrollmentId: application.enrollmentId,
    studentId: application.studentId,
    financialNeed: application.financialNeed,
    trainingGoals: application.trainingGoals,
    amountAbleToPay: application.amountAbleToPay,
    status: scholarshipStatusFromPrisma[application.status],
    adminNotes: application.adminNotes,
    reviewedById: application.reviewedById,
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

class ScholarshipReviewConflict extends Error {}

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

  async listStudents() {
    const students = await prisma.student.findMany({ orderBy: { createdAt: "desc" } });
    return students.map(mapStudent);
  },

  async updateStudentPassword(studentId, passwordHash) {
    await prisma.student.update({ where: { id: studentId }, data: { passwordHash } });
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
    const updated = await prisma.enrollment.updateMany({
      where: { id, status: PrismaEnrollmentStatus.PENDING },
      data: {
        status: PrismaEnrollmentStatus.ACTIVE,
        provider,
        providerRef,
        activatedAt: new Date(),
        accessSuspendedAt: null,
      },
    });
    if (!updated.count) return null;
    return mapEnrollment(await prisma.enrollment.findUniqueOrThrow({ where: { id } }));
  },

  async listStaff() {
    const students = await prisma.student.findMany({
      where: { role: { in: [PrismaStudentRole.STAFF, PrismaStudentRole.ADMIN] } },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    });
    return students.map(mapStudent);
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

  async createScholarshipApplication(input) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const enrollment = await transaction.enrollment.findFirst({
          where: {
            id: input.enrollmentId,
            studentId: input.studentId,
            status: PrismaEnrollmentStatus.PENDING,
          },
          select: { amount: true },
        });
        if (
          !enrollment ||
          input.amountAbleToPay < 0 ||
          input.amountAbleToPay > enrollment.amount
        ) {
          return null;
        }

        const existing = await transaction.scholarshipApplication.findUnique({
          where: { enrollmentId: input.enrollmentId },
        });
        if (existing) return mapScholarshipApplication(existing);

        return mapScholarshipApplication(
          await transaction.scholarshipApplication.create({ data: input })
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.scholarshipApplication.findFirst({
          where: { enrollmentId: input.enrollmentId, studentId: input.studentId },
        });
        if (existing) return mapScholarshipApplication(existing);
      }
      throw error;
    }
  },

  async getScholarshipApplicationForEnrollment(enrollmentId, studentId) {
    const application = await prisma.scholarshipApplication.findFirst({
      where: { enrollmentId, studentId },
    });
    return application ? mapScholarshipApplication(application) : null;
  },

  async getScholarshipApplicationsForStudent(studentId) {
    const applications = await prisma.scholarshipApplication.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    });
    return applications.map(mapScholarshipApplication);
  },

  async listScholarshipApplications() {
    const applications = await prisma.scholarshipApplication.findMany({
      include: { student: true, enrollment: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return applications.map(({ student, enrollment, ...application }) => ({
      ...mapScholarshipApplication(application),
      student: mapStudent(student),
      enrollment: mapEnrollment(enrollment),
    }));
  },

  async countPendingScholarshipApplications() {
    return prisma.scholarshipApplication.count({
      where: { status: PrismaScholarshipStatus.PENDING },
    });
  },

  async reviewScholarshipApplication(input) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const reviewer = await transaction.student.findFirst({
          where: {
            id: input.reviewerId,
            role: { in: [PrismaStudentRole.STAFF, PrismaStudentRole.ADMIN] },
          },
          select: { id: true },
        });
        const application = await transaction.scholarshipApplication.findFirst({
          where: { id: input.applicationId, status: PrismaScholarshipStatus.PENDING },
        });
        if (!reviewer || !application) return null;

        // Claim the pending application first so two staff reviews cannot diverge.
        const reviewed = await transaction.scholarshipApplication.updateMany({
          where: { id: application.id, status: PrismaScholarshipStatus.PENDING },
          data: {
            status:
              input.decision === "approved"
                ? PrismaScholarshipStatus.APPROVED
                : PrismaScholarshipStatus.DECLINED,
            adminNotes: input.adminNotes.trim() || null,
            reviewedById: reviewer.id,
            reviewedAt: new Date(),
          },
        });
        if (!reviewed.count) return null;

        if (input.decision === "approved") {
          const activated = await transaction.enrollment.updateMany({
            where: { id: application.enrollmentId, status: PrismaEnrollmentStatus.PENDING },
            data: {
              status: PrismaEnrollmentStatus.ACTIVE,
              provider: "scholarship",
              providerRef: application.id,
              activatedAt: new Date(),
              accessSuspendedAt: null,
            },
          });
          if (!activated.count) throw new ScholarshipReviewConflict();
        }

        return mapScholarshipApplication(
          await transaction.scholarshipApplication.findUniqueOrThrow({
            where: { id: application.id },
          })
        );
      });
    } catch (error) {
      if (error instanceof ScholarshipReviewConflict) return null;
      throw error;
    }
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
