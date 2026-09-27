CREATE TYPE "InboxChannel" AS ENUM ('WHATSAPP');
CREATE TYPE "InboxConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'SPAM');
CREATE TYPE "InboxMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "InboxMessageStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'FAILED');
CREATE TYPE "WhatsAppProvider" AS ENUM ('ONESENDER', 'WABA', 'STARSENDER');

ALTER TABLE "IntegrationSetting"
  ADD COLUMN "whatsappProvider" "WhatsAppProvider",
  ADD COLUMN "whatsappApiKey" TEXT,
  ADD COLUMN "whatsappSenderNumber" TEXT,
  ADD COLUMN "whatsappPhoneNumberId" TEXT,
  ADD COLUMN "whatsappWebhookVerifyToken" TEXT,
  ADD COLUMN "whatsappWebhookSecret" TEXT,
  ADD COLUMN "whatsappIsActive" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "InboxConversation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT,
  "channel" "InboxChannel" NOT NULL DEFAULT 'WHATSAPP',
  "status" "InboxConversationStatus" NOT NULL DEFAULT 'OPEN',
  "contactName" TEXT,
  "contactPhone" TEXT NOT NULL,
  "subject" TEXT,
  "lastMessagePreview" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboxMessage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "direction" "InboxMessageDirection" NOT NULL,
  "status" "InboxMessageStatus" NOT NULL DEFAULT 'RECEIVED',
  "body" TEXT NOT NULL,
  "provider" "WhatsAppProvider",
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxConversation_workspaceId_channel_contactPhone_key" ON "InboxConversation"("workspaceId", "channel", "contactPhone");
CREATE INDEX "InboxConversation_workspaceId_status_lastMessageAt_idx" ON "InboxConversation"("workspaceId", "status", "lastMessageAt");
CREATE INDEX "InboxConversation_customerId_idx" ON "InboxConversation"("customerId");
CREATE INDEX "InboxMessage_workspaceId_createdAt_idx" ON "InboxMessage"("workspaceId", "createdAt");
CREATE INDEX "InboxMessage_conversationId_createdAt_idx" ON "InboxMessage"("conversationId", "createdAt");
CREATE INDEX "InboxMessage_providerMessageId_idx" ON "InboxMessage"("providerMessageId");

ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
