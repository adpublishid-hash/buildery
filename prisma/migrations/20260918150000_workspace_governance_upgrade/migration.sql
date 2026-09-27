CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_DELETION');
CREATE TYPE "WorkspaceDomainStatus" AS ENUM ('UNCONFIGURED', 'PENDING', 'ACTIVE', 'ERROR');
CREATE TYPE "WorkspaceDomainSslStatus" AS ENUM ('UNCONFIGURED', 'PENDING', 'ACTIVE', 'ERROR');
CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'WORKSPACE_LIFECYCLE_SWEEP';

ALTER TABLE "Workspace"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'id-ID',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'IDR',
  ADD COLUMN "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deleteAfter" TIMESTAMP(3),
  ADD COLUMN "customDomainStatus" "WorkspaceDomainStatus" NOT NULL DEFAULT 'UNCONFIGURED',
  ADD COLUMN "customDomainVerificationToken" TEXT,
  ADD COLUMN "customDomainVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "customDomainLastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "customDomainError" TEXT,
  ADD COLUMN "customDomainSslStatus" "WorkspaceDomainSslStatus" NOT NULL DEFAULT 'UNCONFIGURED',
  ADD COLUMN "customDomainSslExpiresAt" TIMESTAMP(3);

UPDATE "Workspace"
SET "customDomainStatus" = 'PENDING',
    "customDomainSslStatus" = 'PENDING'
WHERE "customDomain" IS NOT NULL;

ALTER TABLE "WorkspaceMember"
  ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastOpenedAt" TIMESTAMP(3);

UPDATE "WorkspaceMember" SET "lastOpenedAt" = "updatedAt";

ALTER TABLE "WorkspaceInvitation"
  ADD COLUMN "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "declinedAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3);

UPDATE "WorkspaceInvitation"
SET "status" = CASE
  WHEN "acceptedAt" IS NOT NULL THEN 'ACCEPTED'::"WorkspaceInvitationStatus"
  ELSE 'EXPIRED'::"WorkspaceInvitationStatus"
END;

ALTER TABLE "SaaSPlan" ADD COLUMN "memberLimit" INTEGER;

UPDATE "SaaSPlan"
SET "memberLimit" = CASE "tier"::text
  WHEN 'FREE' THEN 2
  WHEN 'STARTER' THEN 5
  WHEN 'PRO' THEN 20
  ELSE NULL
END;

CREATE TABLE "WorkspaceSlugHistory" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceSlugHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceAuditLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceSlugHistory_slug_key" ON "WorkspaceSlugHistory"("slug");
CREATE INDEX "WorkspaceSlugHistory_workspaceId_idx" ON "WorkspaceSlugHistory"("workspaceId");
CREATE INDEX "WorkspaceAuditLog_workspaceId_createdAt_idx" ON "WorkspaceAuditLog"("workspaceId", "createdAt");
CREATE INDEX "WorkspaceAuditLog_actorId_idx" ON "WorkspaceAuditLog"("actorId");
CREATE INDEX "Workspace_status_deleteAfter_idx" ON "Workspace"("status", "deleteAfter");
CREATE INDEX "WorkspaceInvitation_status_expiresAt_idx" ON "WorkspaceInvitation"("status", "expiresAt");

ALTER TABLE "WorkspaceSlugHistory"
  ADD CONSTRAINT "WorkspaceSlugHistory_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceAuditLog"
  ADD CONSTRAINT "WorkspaceAuditLog_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceAuditLog"
  ADD CONSTRAINT "WorkspaceAuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
