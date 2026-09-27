ALTER TABLE "IntegrationSetting"
  ADD COLUMN "metaCapiEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "metaCapiAccessToken" TEXT,
  ADD COLUMN "metaCapiTestEventCode" TEXT;
