ALTER TABLE "IntegrationSetting"
  ADD COLUMN "gmailOAuthEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gmailClientId" TEXT,
  ADD COLUMN "gmailClientSecret" TEXT,
  ADD COLUMN "gmailRefreshToken" TEXT,
  ADD COLUMN "gmailSenderEmail" TEXT,
  ADD COLUMN "gmailSenderName" TEXT;
