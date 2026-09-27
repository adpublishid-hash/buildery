-- Extra Meta / TikTok pixels per workspace. Idempotent: local databases have
-- drifted from the migration history before.
CREATE TABLE IF NOT EXISTS "AdPixel" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "pixelId" TEXT NOT NULL,
  "label" TEXT,
  "serverEnabled" BOOLEAN NOT NULL DEFAULT false,
  "accessToken" TEXT,
  "testEventCode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdPixel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdPixel_workspaceId_provider_pixelId_key"
  ON "AdPixel"("workspaceId", "provider", "pixelId");
CREATE INDEX IF NOT EXISTS "AdPixel_workspaceId_provider_isActive_idx"
  ON "AdPixel"("workspaceId", "provider", "isActive");
DO $$ BEGIN
  ALTER TABLE "AdPixel" ADD CONSTRAINT "AdPixel_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Queue rows now name the pixel they are for ("" = the primary pixel, which is
-- what every existing row was). The dedupe key has to include it, or the copy
-- of an event for a second pixel collides with the first and is dropped.
ALTER TABLE "MetaCapiEvent" ADD COLUMN IF NOT EXISTS "target" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "MetaCapiEvent_active_event_dedupe_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MetaCapiEvent_active_event_dedupe_key"
  ON "MetaCapiEvent"("workspaceId", "provider", "target", "eventName", "eventId")
  WHERE "failedAt" IS NULL AND "eventName" IS NOT NULL AND "eventId" IS NOT NULL;
