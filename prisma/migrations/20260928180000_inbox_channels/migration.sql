-- Inbox channels beyond WhatsApp, connected through the integration catalog.
ALTER TYPE "InboxChannel" ADD VALUE 'TELEGRAM';
ALTER TYPE "InboxChannel" ADD VALUE 'INSTAGRAM';
ALTER TYPE "InboxChannel" ADD VALUE 'MESSENGER';
ALTER TYPE "InboxChannel" ADD VALUE 'WEBCHAT';

ALTER TABLE "InboxConversation" ADD COLUMN "contactEmail" TEXT;
