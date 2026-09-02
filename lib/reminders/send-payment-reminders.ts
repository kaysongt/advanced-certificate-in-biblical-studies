import "server-only";

import { createHash } from "node:crypto";
import {
  EnrollmentStatus,
  PaymentReminderStatus,
  Prisma,
  ScholarshipStatus,
} from "@prisma/client";
import { Resend } from "resend";

import { getCurriculum } from "@/lib/curriculum";
import { prisma } from "@/lib/db/prisma";
import { buildPaymentReminderEmail } from "@/lib/reminders/payment-reminder-email";
import {
  getPaymentReminderTiming,
  shouldSuppressPaymentReminder,
  type PaymentReminderMilestone,
  type PaymentReminderTiming,
} from "@/lib/reminders/payment-reminder-policy";

const MAX_REMINDERS_PER_RUN = 100;
const MAX_CANDIDATES_PER_RUN = 500;
const MAX_DELIVERY_ATTEMPTS = 5;
const STALE_CLAIM_MS = 2 * 60 * 60 * 1000;

type ReminderConfiguration = {
  apiKey: string;
  baseUrl: string;
  from: string;
  replyTo: string;
};

type ClaimedReminder = {
  enrollmentId: string;
  reminderId: string;
  milestone: PaymentReminderMilestone;
  timing: PaymentReminderTiming & { milestone: PaymentReminderMilestone };
};

export type PaymentReminderRunResult = {
  scanned: number;
  due: number;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
};

function reminderConfiguration(): ReminderConfiguration {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const from =
    process.env.PAYMENT_REMINDER_FROM?.trim() ||
    "KingsWord Training Institute <reminders@thekti.org>";
  const baseUrlValue =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.thekti.org";
  const baseUrl = new URL(baseUrlValue);
  if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost") {
    throw new Error("Payment reminder links require an HTTPS base URL.");
  }

  return {
    apiKey,
    baseUrl: baseUrl.origin,
    from,
    replyTo: process.env.PAYMENT_REMINDER_REPLY_TO?.trim() || getCurriculum().program.contact.email,
  };
}

function conciseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown delivery failure";
  return message.slice(0, 500);
}

async function claimReminder(input: {
  enrollmentId: string;
  milestone: PaymentReminderMilestone;
  now: Date;
}): Promise<string | null> {
  try {
    const reminder = await prisma.paymentReminder.create({
      data: {
        enrollmentId: input.enrollmentId,
        milestone: input.milestone,
      },
    });
    return reminder.id;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  const staleBefore = new Date(input.now.getTime() - STALE_CLAIM_MS);
  const reclaimed = await prisma.paymentReminder.updateMany({
    where: {
      enrollmentId: input.enrollmentId,
      milestone: input.milestone,
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
      OR: [
        { status: PaymentReminderStatus.FAILED },
        { status: PaymentReminderStatus.SENDING, updatedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: PaymentReminderStatus.SENDING,
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  if (reclaimed.count !== 1) return null;

  const reminder = await prisma.paymentReminder.findUnique({
    where: {
      enrollmentId_milestone: {
        enrollmentId: input.enrollmentId,
        milestone: input.milestone,
      },
    },
    select: { id: true },
  });
  return reminder?.id ?? null;
}

export async function sendDuePaymentReminders(
  now = new Date()
): Promise<PaymentReminderRunResult> {
  const configuration = reminderConfiguration();
  const candidates = await prisma.enrollment.findMany({
    where: {
      status: EnrollmentStatus.PENDING,
      OR: [
        { scholarshipApplication: { is: null } },
        {
          scholarshipApplication: {
            is: { status: ScholarshipStatus.DECLINED },
          },
        },
      ],
    },
    include: {
      student: true,
      scholarshipApplication: true,
      stripePaymentAttempts: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_CANDIDATES_PER_RUN,
  });

  const due = candidates
    .map((enrollment) => ({
      enrollment,
      timing: getPaymentReminderTiming(
        {
          plan: enrollment.plan === "ADVANCED" ? "advanced" : "certificate",
          product: enrollment.product,
        },
        now
      ),
    }))
    .filter(
      (item): item is typeof item & {
        timing: PaymentReminderTiming & { milestone: PaymentReminderMilestone };
      } =>
        item.timing?.milestone !== null &&
        item.timing?.milestone !== undefined &&
        !shouldSuppressPaymentReminder({
          scholarshipStatus: item.enrollment.scholarshipApplication?.status ?? null,
          latestAttempt: item.enrollment.stripePaymentAttempts[0] ?? null,
          now,
        })
    )
    .slice(0, MAX_REMINDERS_PER_RUN);

  const claims: ClaimedReminder[] = [];
  for (const item of due) {
    const reminderId = await claimReminder({
      enrollmentId: item.enrollment.id,
      milestone: item.timing.milestone,
      now,
    });
    if (reminderId) {
      claims.push({
        enrollmentId: item.enrollment.id,
        reminderId,
        milestone: item.timing.milestone,
        timing: item.timing,
      });
    }
  }

  if (!claims.length) {
    return {
      scanned: candidates.length,
      due: due.length,
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: due.length,
    };
  }

  // Re-read immediately before delivery so a just-completed payment or newly
  // submitted scholarship is not reminded from the earlier snapshot.
  const currentEnrollments = await prisma.enrollment.findMany({
    where: {
      id: { in: claims.map((claim) => claim.enrollmentId) },
      status: EnrollmentStatus.PENDING,
    },
    include: {
      student: true,
      scholarshipApplication: true,
      stripePaymentAttempts: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
  const enrollmentById = new Map(currentEnrollments.map((item) => [item.id, item]));
  const deliveryClaims = claims.filter((claim) => {
    const enrollment = enrollmentById.get(claim.enrollmentId);
    return Boolean(
      enrollment &&
        !shouldSuppressPaymentReminder({
          scholarshipStatus: enrollment.scholarshipApplication?.status ?? null,
          latestAttempt: enrollment.stripePaymentAttempts[0] ?? null,
          now,
        })
    );
  });
  const abandonedClaims = claims.filter(
    (claim) => !deliveryClaims.some((delivery) => delivery.reminderId === claim.reminderId)
  );
  if (abandonedClaims.length) {
    await prisma.paymentReminder.deleteMany({
      where: { id: { in: abandonedClaims.map((claim) => claim.reminderId) } },
    });
  }

  if (!deliveryClaims.length) {
    return {
      scanned: candidates.length,
      due: due.length,
      claimed: claims.length,
      sent: 0,
      failed: 0,
      skipped: due.length,
    };
  }

  const messages = deliveryClaims.map((claim) => {
    const enrollment = enrollmentById.get(claim.enrollmentId);
    if (!enrollment) throw new Error("Claimed enrollment disappeared before delivery.");
    const dashboardUrl = `${configuration.baseUrl}/dashboard#complete-payment`;
    const scholarshipUrl = `${configuration.baseUrl}/scholarship?enrollment=${encodeURIComponent(enrollment.id)}`;
    const email = buildPaymentReminderEmail({
      fullName: enrollment.student.fullName,
      amount: enrollment.amount,
      currency: enrollment.currency,
      timing: claim.timing,
      dashboardUrl,
      scholarshipUrl,
    });
    return {
      from: configuration.from,
      to: enrollment.student.email,
      replyTo: configuration.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [
        { name: "category", value: "payment-reminder" },
        { name: "milestone", value: claim.milestone },
      ],
    };
  });

  const idempotencyDigest = createHash("sha256")
    .update(deliveryClaims.map((claim) => claim.reminderId).sort().join(":"))
    .digest("hex");
  const resend = new Resend(configuration.apiKey);

  try {
    const response = await resend.batch.send(messages, {
      idempotencyKey: `payment-reminders-${idempotencyDigest}`,
    });
    if (response.error || !response.data) {
      throw new Error(response.error?.message ?? "Resend returned no delivery result.");
    }
    if (response.data.data.length !== deliveryClaims.length) {
      throw new Error("Resend returned an unexpected number of message IDs.");
    }

    await prisma.$transaction(
      deliveryClaims.map((claim, index) =>
        prisma.paymentReminder.update({
          where: { id: claim.reminderId },
          data: {
            status: PaymentReminderStatus.SENT,
            providerMessageId: response.data!.data[index].id,
            sentAt: now,
            lastError: null,
          },
        })
      )
    );

    return {
      scanned: candidates.length,
      due: due.length,
      claimed: claims.length,
      sent: deliveryClaims.length,
      failed: 0,
      skipped: due.length - deliveryClaims.length,
    };
  } catch (error) {
    const lastError = conciseError(error);
    await prisma.paymentReminder.updateMany({
      where: { id: { in: deliveryClaims.map((claim) => claim.reminderId) } },
      data: { status: PaymentReminderStatus.FAILED, lastError },
    });
    throw error;
  }
}
