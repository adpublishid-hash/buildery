-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_requestId_key" ON "FormSubmission"("requestId");
