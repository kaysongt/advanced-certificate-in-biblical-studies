-- CreateEnum
CREATE TYPE "PaystackPaymentStatus" AS ENUM ('CREATED', 'OPEN', 'PAID', 'FAILED', 'ABANDONED', 'REVERSED');

-- CreateTable
CREATE TABLE "PaystackPaymentAttempt" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "activeKey" TEXT,
    "reference" TEXT NOT NULL,
    "transactionId" TEXT,
    "expectedAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaystackPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "paidAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaystackPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaystackPaymentAttempt_activeKey_key" ON "PaystackPaymentAttempt"("activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaystackPaymentAttempt_reference_key" ON "PaystackPaymentAttempt"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PaystackPaymentAttempt_transactionId_key" ON "PaystackPaymentAttempt"("transactionId");

-- CreateIndex
CREATE INDEX "PaystackPaymentAttempt_enrollmentId_createdAt_idx" ON "PaystackPaymentAttempt"("enrollmentId", "createdAt");

-- CreateIndex
CREATE INDEX "PaystackPaymentAttempt_status_updatedAt_idx" ON "PaystackPaymentAttempt"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PaystackPaymentAttempt_needsReview_updatedAt_idx" ON "PaystackPaymentAttempt"("needsReview", "updatedAt");

-- AddForeignKey
ALTER TABLE "PaystackPaymentAttempt" ADD CONSTRAINT "PaystackPaymentAttempt_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

