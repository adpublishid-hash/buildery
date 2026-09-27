-- Add queue-level dedupe metadata for Meta CAPI events.
ALTER TABLE "MetaCapiEvent"
  ADD COLUMN "eventName" TEXT,
  ADD COLUMN "eventId" TEXT;

CREATE INDEX "MetaCapiEvent_workspaceId_eventName_eventId_idx"
  ON "MetaCapiEvent"("workspaceId", "eventName", "eventId");

-- Prevent duplicate pending/sent events while still allowing a retry after a
-- permanent failure has been marked with failedAt.
CREATE UNIQUE INDEX "MetaCapiEvent_active_event_dedupe_key"
  ON "MetaCapiEvent"("workspaceId", "eventName", "eventId")
  WHERE "failedAt" IS NULL AND "eventName" IS NOT NULL AND "eventId" IS NOT NULL;
