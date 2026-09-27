-- AlterEnum
ALTER TYPE "AnalyticsEventType" ADD VALUE 'FORM_VIEW';

-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "formId" TEXT,
ADD COLUMN     "formStep" INTEGER;

-- CreateIndex
CREATE INDEX "AnalyticsEvent_formId_formStep_idx" ON "AnalyticsEvent"("formId", "formStep");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
