-- AlterEnum
ALTER TYPE "ScheduledJobKind" ADD VALUE 'FORM_DELIVERY_RETRY';

-- AlterTable
ALTER TABLE "FormDelivery" ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "FormDelivery_status_nextAttemptAt_idx" ON "FormDelivery"("status", "nextAttemptAt");
