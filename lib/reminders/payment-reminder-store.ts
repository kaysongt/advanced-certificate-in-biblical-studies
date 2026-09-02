import "server-only";

import { PaymentReminderStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type PaymentReminderSummary = {
  status: "sending" | "sent" | "failed";
  milestone: string;
  attempts: number;
  sentAt: string | null;
  updatedAt: string;
};

const statusFromPrisma: Record<
  PaymentReminderStatus,
  PaymentReminderSummary["status"]
> = {
  SENDING: "sending",
  SENT: "sent",
  FAILED: "failed",
};

export async function listLatestPaymentReminders(
  enrollmentIds: string[]
): Promise<Map<string, PaymentReminderSummary>> {
  if (!enrollmentIds.length || !process.env.DATABASE_URL) return new Map();

  const reminders = await prisma.paymentReminder.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    orderBy: { updatedAt: "desc" },
  });
  const latest = new Map<string, PaymentReminderSummary>();
  for (const reminder of reminders) {
    if (!latest.has(reminder.enrollmentId)) {
      latest.set(reminder.enrollmentId, {
        status: statusFromPrisma[reminder.status],
        milestone: reminder.milestone,
        attempts: reminder.attempts,
        sentAt: reminder.sentAt?.toISOString() ?? null,
        updatedAt: reminder.updatedAt.toISOString(),
      });
    }
  }
  return latest;
}
