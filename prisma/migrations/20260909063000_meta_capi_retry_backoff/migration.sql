-- Add per-event retry scheduling so transient Meta CAPI failures do not get
-- retried on every one-minute flush tick.
ALTER TABLE "MetaCapiEvent"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "MetaCapiEvent_workspaceId_nextAttemptAt_createdAt_idx"
  ON "MetaCapiEvent"("workspaceId", "nextAttemptAt", "createdAt");

CREATE INDEX "MetaCapiEvent_nextAttemptAt_idx"
  ON "MetaCapiEvent"("nextAttemptAt");
