-- Affiliate lifecycle, trustworthy attribution, commission snapshots, and payouts.
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "AffiliateApprovalMode" AS ENUM ('AUTO', 'MANUAL');
CREATE TYPE "AffiliateAttributionModel" AS ENUM ('FIRST_CLICK', 'LAST_CLICK');
CREATE TYPE "CommissionSourceType" AS ENUM ('ORDER', 'ENROLLMENT', 'MEMBERSHIP');
CREATE TYPE "AffiliatePayoutStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');
CREATE TYPE "AffiliatePayoutMethod" AS ENUM ('BANK_TRANSFER', 'EWALLET', 'OTHER');
CREATE TYPE "AffiliateCreativeType" AS ENUM ('LINK', 'IMAGE', 'COPY');

ALTER TYPE "CommissionStatus" ADD VALUE IF NOT EXISTS 'PAYOUT_SCHEDULED' BEFORE 'PAID';
ALTER TYPE "CommissionAdjustmentType" ADD VALUE IF NOT EXISTS 'COURSE_REFUND';
ALTER TYPE "CommissionAdjustmentType" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_REFUND';
ALTER TYPE "CommissionAdjustmentType" ADD VALUE IF NOT EXISTS 'MANUAL';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'AFFILIATE_APPLICATION_RECEIVED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'AFFILIATE_APPROVED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'AFFILIATE_SALE';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'COMMISSION_APPROVED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'COMMISSION_REVERSED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'PAYOUT_PAID';
ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'AFFILIATE_LIFECYCLE_SWEEP';

ALTER TABLE "AffiliateProgram"
  ADD COLUMN "approvalMode" "AffiliateApprovalMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "attributionModel" "AffiliateAttributionModel" NOT NULL DEFAULT 'LAST_CLICK',
  ADD COLUMN "attributionDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "holdDays" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "minimumPayout" INTEGER NOT NULL DEFAULT 100000,
  ADD COLUMN "allowSelfReferral" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "includeShipping" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "includeTax" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "includeFees" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "terms" TEXT;

ALTER TABLE "Affiliate"
  ADD COLUMN "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "payoutMethod" "AffiliatePayoutMethod",
  ADD COLUMN "payoutAccountLabel" TEXT,
  ADD COLUMN "payoutDetailsEncrypted" TEXT,
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);

-- Existing affiliates were already live before lifecycle states existed.
UPDATE "Affiliate"
SET "status" = 'ACTIVE',
    "approvedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
    "emailVerifiedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP);

ALTER TABLE "Payment" ADD COLUMN "referralAffiliateId" TEXT;

ALTER TABLE "Referral"
  ADD COLUMN "clickId" TEXT,
  ADD COLUMN "visitorHash" TEXT,
  ADD COLUMN "ipHash" TEXT,
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "landingUrl" TEXT,
  ADD COLUMN "referrer" TEXT,
  ADD COLUMN "campaign" TEXT,
  ADD COLUMN "utmSource" TEXT,
  ADD COLUMN "utmMedium" TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "deviceType" TEXT,
  ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;

-- Raw IP addresses are no longer retained for new or historical clicks.
UPDATE "Referral" SET "ipAddress" = NULL WHERE "ipAddress" IS NOT NULL;

ALTER TABLE "Commission"
  ADD COLUMN "sourceType" "CommissionSourceType" NOT NULL DEFAULT 'ORDER',
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "sourceLabel" TEXT,
  ADD COLUMN "basisAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'IDR',
  ADD COLUMN "availableAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "CommissionAdjustment"
  ADD COLUMN "recoveredAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recoveredAt" TIMESTAMP(3),
  ADD COLUMN "recoveredPayoutId" TEXT;

UPDATE "Commission" c
SET "sourceKey" = CASE WHEN c."orderId" IS NULL THEN 'legacy:' || c."id" ELSE 'order:' || c."orderId" END,
    "sourceLabel" = COALESCE((SELECT o."orderNumber" FROM "Order" o WHERE o."id" = c."orderId"), 'Legacy commission'),
    "basisAmount" = CASE WHEN c."percent" > 0 THEN ROUND(COALESCE(c."originalAmount", c."amount") * 100.0 / c."percent")::INTEGER ELSE 0 END,
    "rateBps" = c."percent" * 100,
    "availableAt" = c."createdAt" + (p."holdDays" * INTERVAL '1 day'),
    "approvedAt" = CASE WHEN c."status" IN ('APPROVED', 'PAID') THEN c."updatedAt" ELSE NULL END
FROM "Affiliate" a
JOIN "AffiliateProgram" p ON p."id" = a."programId"
WHERE a."id" = c."affiliateId";

CREATE TABLE "AffiliateCodeAlias" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateCodeAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateCreative" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "AffiliateCreativeType" NOT NULL DEFAULT 'LINK',
  "content" TEXT NOT NULL,
  "targetUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AffiliateCreative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliatePayout" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "status" "AffiliatePayoutStatus" NOT NULL DEFAULT 'DRAFT',
  "amount" INTEGER NOT NULL,
  "grossAmount" INTEGER NOT NULL DEFAULT 0,
  "adjustmentAmount" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "method" "AffiliatePayoutMethod",
  "accountLabel" TEXT,
  "accountDetailsEncrypted" TEXT,
  "reference" TEXT,
  "proofUrl" TEXT,
  "note" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliatePayoutItem" (
  "id" TEXT NOT NULL,
  "payoutId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliatePayoutItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateCodeAlias_code_key" ON "AffiliateCodeAlias"("code");
CREATE INDEX "AffiliateCodeAlias_affiliateId_createdAt_idx" ON "AffiliateCodeAlias"("affiliateId", "createdAt");
CREATE INDEX "AffiliateCreative_workspaceId_isActive_sortOrder_idx" ON "AffiliateCreative"("workspaceId", "isActive", "sortOrder");
CREATE INDEX "AffiliateCreative_programId_sortOrder_idx" ON "AffiliateCreative"("programId", "sortOrder");
CREATE INDEX "Affiliate_workspaceId_status_createdAt_idx" ON "Affiliate"("workspaceId", "status", "createdAt");
CREATE INDEX "Payment_workspaceId_referralAffiliateId_idx" ON "Payment"("workspaceId", "referralAffiliateId");
CREATE UNIQUE INDEX "Referral_dedupeKey_key" ON "Referral"("dedupeKey");
CREATE UNIQUE INDEX "Commission_sourceKey_key" ON "Commission"("sourceKey");
CREATE INDEX "Commission_workspaceId_availableAt_status_idx" ON "Commission"("workspaceId", "availableAt", "status");
CREATE UNIQUE INDEX "AffiliatePayout_idempotencyKey_key" ON "AffiliatePayout"("idempotencyKey");
CREATE INDEX "AffiliatePayout_workspaceId_status_createdAt_idx" ON "AffiliatePayout"("workspaceId", "status", "createdAt");
CREATE INDEX "AffiliatePayout_affiliateId_createdAt_idx" ON "AffiliatePayout"("affiliateId", "createdAt");
CREATE UNIQUE INDEX "AffiliatePayoutItem_commissionId_key" ON "AffiliatePayoutItem"("commissionId");
CREATE INDEX "AffiliatePayoutItem_payoutId_idx" ON "AffiliatePayoutItem"("payoutId");

ALTER TABLE "AffiliateCodeAlias" ADD CONSTRAINT "AffiliateCodeAlias_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateCreative" ADD CONSTRAINT "AffiliateCreative_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateCreative" ADD CONSTRAINT "AffiliateCreative_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "AffiliateProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliatePayoutItem" ADD CONSTRAINT "AffiliatePayoutItem_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliatePayoutItem" ADD CONSTRAINT "AffiliatePayoutItem_commissionId_fkey"
  FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
