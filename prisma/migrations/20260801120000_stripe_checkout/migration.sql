-- CreateEnum
CREATE TYPE "StripePaymentStatus" AS ENUM (
    'CREATED',
    'OPEN',
    'PROCESSING',
    'PAID',
    'FAILED',
    'EXPIRED',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
    'DISPUTED'
);

-- AlterTable
ALTER TABLE "Enrollment"
ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "accessSuspendedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentEvent"
ADD COLUMN "processingResult" TEXT NOT NULL DEFAULT 'processed',
ADD COLUMN "eventCreatedAt" TIMESTAMP(3);

UPDATE "PaymentEvent"
SET "eventCreatedAt" = "processedAt"
WHERE "eventCreatedAt" IS NULL;

ALTER TABLE "PaymentEvent"
ALTER COLUMN "processingResult" DROP DEFAULT,
ALTER COLUMN "eventCreatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "StripePaymentAttempt" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "activeKey" TEXT,
    "checkoutSessionId" TEXT,
    "paymentIntentId" TEXT,
    "latestChargeId" TEXT,
    "expectedAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "StripePaymentStatus" NOT NULL DEFAULT 'CREATED',
    "paidAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "refundedAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "disputeStatus" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "stripeCreatedAt" TIMESTAMP(3),
    "lastEventCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripePaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentAttempt_activeKey_key" ON "StripePaymentAttempt"("activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentAttempt_checkoutSessionId_key" ON "StripePaymentAttempt"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentAttempt_paymentIntentId_key" ON "StripePaymentAttempt"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentAttempt_latestChargeId_key" ON "StripePaymentAttempt"("latestChargeId");

-- CreateIndex
CREATE INDEX "StripePaymentAttempt_enrollmentId_createdAt_idx" ON "StripePaymentAttempt"("enrollmentId", "createdAt");

-- CreateIndex
CREATE INDEX "StripePaymentAttempt_status_updatedAt_idx" ON "StripePaymentAttempt"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "StripePaymentAttempt_needsReview_updatedAt_idx" ON "StripePaymentAttempt"("needsReview", "updatedAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_provider_eventCreatedAt_idx" ON "PaymentEvent"("provider", "eventCreatedAt");

-- AddForeignKey
ALTER TABLE "StripePaymentAttempt" ADD CONSTRAINT "StripePaymentAttempt_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
