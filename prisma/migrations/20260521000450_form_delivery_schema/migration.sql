-- Form workflow fields and delivery records were previously present only in
-- Prisma schema / db-push installations. Keep every statement idempotent so
-- databases that already received them can adopt the migration safely.
ALTER TYPE "FormFieldType" ADD VALUE IF NOT EXISTS 'FILE';

DO $$ BEGIN
  CREATE TYPE "FormSubmissionStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED', 'SPAM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FormDeliveryKind" AS ENUM ('EMAIL', 'WEBHOOK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FormDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Form"
  ADD COLUMN IF NOT EXISTS "multiStep" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notifyEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "redirectUrl" TEXT;

ALTER TABLE "FormField"
  ADD COLUMN IF NOT EXISTS "helpText" TEXT,
  ADD COLUMN IF NOT EXISTS "pageStep" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "minLength" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxLength" INTEGER,
  ADD COLUMN IF NOT EXISTS "minValue" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "maxValue" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "pattern" TEXT,
  ADD COLUMN IF NOT EXISTS "patternHint" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptMime" TEXT,
  ADD COLUMN IF NOT EXISTS "visibleIf" JSONB;

ALTER TABLE "FormSubmission"
  ADD COLUMN IF NOT EXISTS "status" "FormSubmissionStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "referrer" TEXT;

CREATE TABLE IF NOT EXISTS "FormDelivery" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kind" "FormDeliveryKind" NOT NULL,
    "target" TEXT NOT NULL,
    "status" "FormDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastTriedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FormDelivery_submissionId_fkey" FOREIGN KEY ("submissionId")
      REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FormDelivery_submissionId_idx"
  ON "FormDelivery"("submissionId");
CREATE INDEX IF NOT EXISTS "FormDelivery_status_lastTriedAt_idx"
  ON "FormDelivery"("status", "lastTriedAt");
CREATE INDEX IF NOT EXISTS "FormSubmission_formId_status_createdAt_idx"
  ON "FormSubmission"("formId", "status", "createdAt");
