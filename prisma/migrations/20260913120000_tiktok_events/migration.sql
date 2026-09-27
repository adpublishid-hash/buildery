-- TikTok Pixel + Events API, sharing the server-side ad event queue with Meta.
-- Idempotent throughout: databases in this project have drifted before.

-- Settings
ALTER TABLE "IntegrationSetting" ADD COLUMN IF NOT EXISTS "tiktokPixelId" TEXT;
ALTER TABLE "IntegrationSetting" ADD COLUMN IF NOT EXISTS "tiktokEventsApiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IntegrationSetting" ADD COLUMN IF NOT EXISTS "tiktokAccessToken" TEXT;
ALTER TABLE "IntegrationSetting" ADD COLUMN IF NOT EXISTS "tiktokTestEventCode" TEXT;

-- Queue: one table, a provider per row. Existing rows are all Meta.
ALTER TABLE "MetaCapiEvent" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'META';
CREATE INDEX IF NOT EXISTS "MetaCapiEvent_provider_workspaceId_sentAt_createdAt_idx"
  ON "MetaCapiEvent"("provider", "workspaceId", "sentAt", "createdAt");

-- The queue-level dedupe key must include the provider, or a TikTok copy of an
-- event would collide with its Meta twin (they share the event id on purpose).
DROP INDEX IF EXISTS "MetaCapiEvent_active_event_dedupe_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MetaCapiEvent_active_event_dedupe_key"
  ON "MetaCapiEvent"("workspaceId", "provider", "eventName", "eventId")
  WHERE "failedAt" IS NULL AND "eventName" IS NOT NULL AND "eventId" IS NOT NULL;

-- Daily delivery stats per provider.
ALTER TABLE "MetaCapiDailyStat" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'META';
DROP INDEX IF EXISTS "MetaCapiDailyStat_workspaceId_day_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MetaCapiDailyStat_workspaceId_provider_day_key"
  ON "MetaCapiDailyStat"("workspaceId", "provider", "day");

-- Checkout-time browser context, so a purchase confirmed later by webhook can
-- still be matched to the visitor by Meta and TikTok.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adContext" JSONB;
