-- Repair schema changes that older installations received through db push
-- but that was missing from the checked-in migration history.
ALTER TYPE "BlockType" ADD VALUE IF NOT EXISTS 'BUTTON';
ALTER TYPE "BlockType" ADD VALUE IF NOT EXISTS 'BIO_PROFILE';

ALTER TABLE "CourseLesson"
  ADD COLUMN IF NOT EXISTS "dripDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "isPreview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "password" TEXT;

ALTER TABLE "Website" ADD COLUMN IF NOT EXISTS "homePageId" TEXT;
CREATE INDEX IF NOT EXISTS "Website_homePageId_idx" ON "Website"("homePageId");

-- Shared rate-limit buckets for clustered application workers.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- One affiliate commission and sale referral may be produced per order.
DELETE FROM "Commission"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (
      PARTITION BY "orderId" ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
    FROM "Commission"
    WHERE "orderId" IS NOT NULL
  ) duplicates
  WHERE duplicates.row_number > 1
);

DELETE FROM "Referral"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (
      PARTITION BY "orderId", "event" ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
    FROM "Referral"
    WHERE "orderId" IS NOT NULL
  ) duplicates
  WHERE duplicates.row_number > 1
);

CREATE UNIQUE INDEX "Commission_orderId_key" ON "Commission"("orderId");
CREATE UNIQUE INDEX "Referral_orderId_event_key" ON "Referral"("orderId", "event");
