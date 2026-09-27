-- AlterTable
ALTER TABLE "StorefrontSetting"
    ADD COLUMN "footerEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "footerText" TEXT,
    ADD COLUMN "footerCopyright" TEXT;
