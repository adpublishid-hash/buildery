-- Store notification retry metadata and recurring retry job.
ALTER TYPE "ScheduledJobKind" ADD VALUE 'STORE_NOTIFICATION_RETRY';

ALTER TABLE "StoreNotification"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "StoreNotification_workspaceId_status_idx"
  ON "StoreNotification"("workspaceId", "status");

CREATE INDEX "StoreNotification_status_nextAttemptAt_idx"
  ON "StoreNotification"("status", "nextAttemptAt");
