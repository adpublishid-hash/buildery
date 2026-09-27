ALTER TYPE "StoreNotificationChannel" ADD VALUE 'TELEGRAM';
ALTER TYPE "FormDeliveryKind" ADD VALUE 'TELEGRAM';

ALTER TABLE "IntegrationSetting"
  ADD COLUMN "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "telegramBotToken" TEXT,
  ADD COLUMN "telegramChatId" TEXT,
  ADD COLUMN "telegramMessageThreadId" TEXT;
