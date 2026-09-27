-- AlterTable
-- IF NOT EXISTS: this database carries drift from an earlier fork that already
-- added some of these columns. Adding them unconditionally fails there, and
-- dropping the drift is not safe, so the migration is written to converge
-- either way.
ALTER TABLE "IntegrationSetting"
  ADD COLUMN IF NOT EXISTS "whatsappApiBaseUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappCloudEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whatsappDefaultTemplateLanguage" TEXT DEFAULT 'en_US',
  ADD COLUMN IF NOT EXISTS "whatsappGraphVersion" TEXT DEFAULT 'v25.0';
