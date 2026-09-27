-- Ad tracking upgrade: cookie consent, Google (GA4 Measurement Protocol and
-- Ads conversion), and a once-a-day marker for token-rejection alerts.
-- Idempotent throughout.

ALTER TABLE "IntegrationSetting" ADD COLUMN IF NOT EXISTS "adConsentRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IntegrationSetting" ADD COLUMN IF NOT EXISTS "googleAnalyticsApiSecret" TEXT;
ALTER TABLE "IntegrationSetting" ADD COLUMN IF NOT EXISTS "googleAdsConversionId" TEXT;
ALTER TABLE "IntegrationSetting" ADD COLUMN IF NOT EXISTS "googleAdsPurchaseLabel" TEXT;

ALTER TABLE "MetaCapiDailyStat" ADD COLUMN IF NOT EXISTS "alertedAt" TIMESTAMP(3);
