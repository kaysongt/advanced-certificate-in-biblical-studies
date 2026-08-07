-- AlterTable
ALTER TABLE "StripePaymentAttempt" ADD COLUMN     "discountAmountMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promotionCode" TEXT;
