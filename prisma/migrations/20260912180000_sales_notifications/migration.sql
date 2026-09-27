-- AlterTable
ALTER TABLE "StorefrontSetting"
  ADD COLUMN IF NOT EXISTS "salesNotificationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "salesNotificationText" TEXT;
