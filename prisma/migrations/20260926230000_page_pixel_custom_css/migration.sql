-- Per-page tracking event and custom CSS, edited from the builder's page settings.
-- Idempotent: local databases have drifted from the migration history before.
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "pixelEvent" TEXT;
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "customCss" TEXT;
