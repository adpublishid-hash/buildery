ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_WELCOME';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_RENEWED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_EXPIRING';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_EXPIRED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_CANCELLED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_PAYMENT_FAILED';
ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_LIFECYCLE_SWEEP';

CREATE TYPE "MembershipGrantSource" AS ENUM ('FREE_JOIN', 'PAYMENT', 'PRODUCT_PURCHASE', 'MANUAL', 'RENEWAL', 'UPGRADE');
CREATE TYPE "MembershipEventType" AS ENUM ('CREATED', 'ACTIVATED', 'RENEWED', 'UPGRADED', 'DOWNGRADED', 'EXTENDED', 'CANCELLED', 'EXPIRED');

ALTER TABLE "Customer" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "MembershipPlan"
  ADD COLUMN "benefits" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "recommended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ctaLabel" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "CustomerMembership"
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "lastRenewedAt" TIMESTAMP(3),
  ADD COLUMN "reminder14At" TIMESTAMP(3),
  ADD COLUMN "reminder7At" TIMESTAMP(3),
  ADD COLUMN "reminder1At" TIMESTAMP(3);

ALTER TABLE "Payment" ADD COLUMN "membershipRenewal" BOOLEAN NOT NULL DEFAULT false;
DROP INDEX IF EXISTS "Payment_customerMembershipId_key";
CREATE INDEX "Payment_customerMembershipId_createdAt_idx" ON "Payment"("customerMembershipId", "createdAt");
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_customerMembershipId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerMembershipId_fkey" FOREIGN KEY ("customerMembershipId") REFERENCES "CustomerMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerMembership" DROP CONSTRAINT IF EXISTS "CustomerMembership_planId_fkey";
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MembershipGrant" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "paymentId" TEXT,
  "source" "MembershipGrantSource" NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "amount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MembershipEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "type" "MembershipEventType" NOT NULL,
  "actorId" TEXT,
  "fromPlanId" TEXT,
  "toPlanId" TEXT,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipGrant_paymentId_key" ON "MembershipGrant"("paymentId");
CREATE INDEX "MembershipGrant_workspaceId_createdAt_idx" ON "MembershipGrant"("workspaceId", "createdAt");
CREATE INDEX "MembershipGrant_membershipId_createdAt_idx" ON "MembershipGrant"("membershipId", "createdAt");
CREATE INDEX "MembershipEvent_workspaceId_type_createdAt_idx" ON "MembershipEvent"("workspaceId", "type", "createdAt");
CREATE INDEX "MembershipEvent_membershipId_createdAt_idx" ON "MembershipEvent"("membershipId", "createdAt");
CREATE INDEX "MembershipPlan_workspaceId_isActive_sortOrder_idx" ON "MembershipPlan"("workspaceId", "isActive", "sortOrder");
CREATE INDEX "CustomerMembership_workspaceId_status_expiresAt_idx" ON "CustomerMembership"("workspaceId", "status", "expiresAt");
CREATE INDEX "CustomerMembership_customerId_status_expiresAt_idx" ON "CustomerMembership"("customerId", "status", "expiresAt");

ALTER TABLE "MembershipGrant" ADD CONSTRAINT "MembershipGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipGrant" ADD CONSTRAINT "MembershipGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CustomerMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipGrant" ADD CONSTRAINT "MembershipGrant_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MembershipEvent" ADD CONSTRAINT "MembershipEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipEvent" ADD CONSTRAINT "MembershipEvent_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CustomerMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MembershipGrant" ("id", "workspaceId", "membershipId", "paymentId", "source", "startsAt", "expiresAt", "amount", "metadata")
SELECT
  'backfill-grant-' || cm."id",
  cm."workspaceId",
  cm."id",
  p."id",
  CASE WHEN p."id" IS NULL THEN 'MANUAL'::"MembershipGrantSource" ELSE 'PAYMENT'::"MembershipGrantSource" END,
  cm."startedAt",
  cm."expiresAt",
  COALESCE(p."amount", 0),
  '{"backfilled":true}'::jsonb
FROM "CustomerMembership" cm
LEFT JOIN LATERAL (
  SELECT "id", "amount" FROM "Payment"
  WHERE "customerMembershipId" = cm."id" AND "status" = 'PAID'
  ORDER BY "createdAt" ASC LIMIT 1
) p ON true
WHERE cm."status" IN ('ACTIVE', 'EXPIRED', 'CANCELLED');

INSERT INTO "MembershipEvent" ("id", "workspaceId", "membershipId", "type", "detail", "createdAt")
SELECT
  'backfill-event-' || cm."id",
  cm."workspaceId",
  cm."id",
  CASE
    WHEN cm."status" = 'EXPIRED' THEN 'EXPIRED'::"MembershipEventType"
    WHEN cm."status" = 'CANCELLED' THEN 'CANCELLED'::"MembershipEventType"
    ELSE 'ACTIVATED'::"MembershipEventType"
  END,
  '{"backfilled":true}'::jsonb,
  cm."updatedAt"
FROM "CustomerMembership" cm
WHERE cm."status" IN ('ACTIVE', 'EXPIRED', 'CANCELLED');
