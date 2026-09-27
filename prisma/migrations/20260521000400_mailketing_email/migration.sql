ALTER TABLE "IntegrationSetting"
  ADD COLUMN "mailketingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mailketingApiToken" TEXT,
  ADD COLUMN "mailketingSenderName" TEXT,
  ADD COLUMN "mailketingSenderEmail" TEXT;
