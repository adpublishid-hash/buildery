-- CreateEnum
CREATE TYPE "ScheduledJobKind" AS ENUM ('META_CAPI_FLUSH');

-- CreateEnum
CREATE TYPE "ScheduledJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "kind" "ScheduledJobKind" NOT NULL,
    "status" "ScheduledJobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCapiEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCapiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCapiDailyStat" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "staleDropped" INTEGER NOT NULL DEFAULT 0,
    "tokenErrors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastFailureAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCapiDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledJob_status_runAt_idx" ON "ScheduledJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "ScheduledJob_dedupeKey_status_idx" ON "ScheduledJob"("dedupeKey", "status");

-- CreateIndex
CREATE INDEX "ScheduledJob_workspaceId_kind_status_idx" ON "ScheduledJob"("workspaceId", "kind", "status");

-- CreateIndex
CREATE INDEX "MetaCapiEvent_workspaceId_sentAt_createdAt_idx" ON "MetaCapiEvent"("workspaceId", "sentAt", "createdAt");

-- CreateIndex
CREATE INDEX "MetaCapiEvent_workspaceId_failedAt_createdAt_idx" ON "MetaCapiEvent"("workspaceId", "failedAt", "createdAt");

-- CreateIndex
CREATE INDEX "MetaCapiEvent_sentAt_idx" ON "MetaCapiEvent"("sentAt");

-- CreateIndex
CREATE INDEX "MetaCapiEvent_failedAt_idx" ON "MetaCapiEvent"("failedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCapiDailyStat_workspaceId_day_key" ON "MetaCapiDailyStat"("workspaceId", "day");

-- CreateIndex
CREATE INDEX "MetaCapiDailyStat_workspaceId_day_idx" ON "MetaCapiDailyStat"("workspaceId", "day");

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCapiEvent" ADD CONSTRAINT "MetaCapiEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCapiDailyStat" ADD CONSTRAINT "MetaCapiDailyStat_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
