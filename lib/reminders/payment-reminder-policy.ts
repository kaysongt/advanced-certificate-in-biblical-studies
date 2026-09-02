import {
  PROGRAM_TIME_ZONE,
  formatModuleReleaseDate,
  getCurriculum,
  type Module,
} from "@/lib/curriculum";

export const PAYMENT_REMINDER_MILESTONES = [
  "21-days",
  "7-days",
  "1-day",
  "started",
] as const;

export type PaymentReminderMilestone = (typeof PAYMENT_REMINDER_MILESTONES)[number];

export type PaymentReminderTiming = {
  milestone: PaymentReminderMilestone | null;
  daysUntilStart: number;
  offeringTitle: string;
  startDate: string;
  startDateLabel: string;
};

type EnrollmentForReminder = {
  plan: "advanced" | "certificate";
  product: string;
};

type PaymentAttemptForReminder = {
  status: string;
  needsReview: boolean;
  promotionCode: string | null;
  discountAmountMinor: number;
  expectedAmountMinor: number;
  updatedAt: Date;
};

const programDateDisplay = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: PROGRAM_TIME_ZONE,
});

const PAYMENT_IN_PROGRESS_STATUSES = new Set([
  "PROCESSING",
  "PAID",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
]);

const RECENT_CHECKOUT_WINDOW_MS = 60 * 60 * 1000;

/** Convert an instant into the Institute's local calendar date. */
export function currentProgramDate(now = new Date()): string {
  const parts = Object.fromEntries(
    programDateDisplay
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateOnlyOrdinal(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date-only value: ${value}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function calendarDaysUntil(startDate: string, todayDate: string): number {
  return Math.round((dateOnlyOrdinal(startDate) - dateOnlyOrdinal(todayDate)) / 86_400_000);
}

export function selectPaymentReminderMilestone(
  daysUntilStart: number
): PaymentReminderMilestone | null {
  if (daysUntilStart <= 0) return "started";
  if (daysUntilStart <= 1) return "1-day";
  if (daysUntilStart <= 7) return "7-days";
  if (daysUntilStart <= 21) return "21-days";
  return null;
}

function enrollmentModule(enrollment: EnrollmentForReminder): Module | null {
  const curriculum = getCurriculum();
  if (enrollment.plan === "advanced") return curriculum.modules[0] ?? null;
  return curriculum.modules.find((module) => module.slug === enrollment.product) ?? null;
}

export function getPaymentReminderTiming(
  enrollment: EnrollmentForReminder,
  now = new Date()
): PaymentReminderTiming | null {
  const module = enrollmentModule(enrollment);
  if (!module) return null;

  const daysUntilStart = calendarDaysUntil(module.release_date, currentProgramDate(now));
  return {
    milestone: selectPaymentReminderMilestone(daysUntilStart),
    daysUntilStart,
    offeringTitle:
      enrollment.plan === "advanced"
        ? getCurriculum().program.title
        : module.short_title,
    startDate: module.release_date,
    startDateLabel: formatModuleReleaseDate(module),
  };
}

/**
 * Avoid payment reminders while another route may still activate access or
 * while staff are considering tuition support. Declined applicants remain
 * eligible because payment is their next available path.
 */
export function shouldSuppressPaymentReminder(input: {
  scholarshipStatus: string | null;
  latestAttempt: PaymentAttemptForReminder | null;
  now?: Date;
}): boolean {
  if (input.scholarshipStatus === "PENDING" || input.scholarshipStatus === "APPROVED") {
    return true;
  }

  const attempt = input.latestAttempt;
  if (!attempt) return false;
  if (attempt.needsReview || attempt.promotionCode) return true;
  if (
    attempt.expectedAmountMinor > 0 &&
    attempt.discountAmountMinor >= attempt.expectedAmountMinor
  ) {
    return true;
  }
  if (PAYMENT_IN_PROGRESS_STATUSES.has(attempt.status)) return true;

  const now = input.now ?? new Date();
  const recentlyOpened =
    (attempt.status === "CREATED" || attempt.status === "OPEN") &&
    now.getTime() - attempt.updatedAt.getTime() < RECENT_CHECKOUT_WINDOW_MS;
  return recentlyOpened;
}
