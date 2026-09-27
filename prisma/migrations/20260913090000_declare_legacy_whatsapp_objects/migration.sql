-- Declares objects the pre-merge lineage created and nothing uses any more.
--
-- Existing databases already have them, so every statement is idempotent; a
-- fresh database gets them so its shape matches production exactly. The point
-- is that `prisma migrate diff` stops proposing DROPs — noise that would one
-- day be applied by someone not looking closely.

ALTER TABLE "IntegrationSetting"
  ADD COLUMN IF NOT EXISTS "whatsappAccessToken" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappAppSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappBusinessAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappDefaultTemplateName" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappDefaultTemplateParameters" TEXT,
  ADD COLUMN IF NOT EXISTS "oneSenderApiKey" TEXT,
  ADD COLUMN IF NOT EXISTS "oneSenderApiUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "oneSenderPhoneNumber" TEXT;

CREATE TABLE IF NOT EXISTS "WhatsAppWebhookEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "messageId" TEXT,
    "from" TEXT,
    "status" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_workspaceId_receivedAt_idx" ON "WhatsAppWebhookEvent"("workspaceId", "receivedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_messageId_idx" ON "WhatsAppWebhookEvent"("messageId");
CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_phoneNumberId_idx" ON "WhatsAppWebhookEvent"("phoneNumberId");

DO $$
BEGIN
  -- Scoped to this table: constraint names in pg_constraint are not unique
  -- across schemas, so a name-only check can find another schema's copy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppWebhookEvent_workspaceId_fkey'
      AND conrelid = '"WhatsAppWebhookEvent"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppWebhookEvent"
      ADD CONSTRAINT "WhatsAppWebhookEvent_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
