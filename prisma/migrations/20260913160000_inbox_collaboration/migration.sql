-- Inbox collaboration: assignment, internal notes, labels, canned replies,
-- attachments, and the WhatsApp 24-hour service window.
--
-- Idempotent throughout, so a partially applied run can be repeated safely.

-- 1. Enums -------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InboxMessageKind') THEN
    CREATE TYPE "InboxMessageKind" AS ENUM (
      'TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'UNKNOWN'
    );
  END IF;
END $$;

ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'INBOX_NOTIFY';
ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'INBOX_PRUNE';

-- 2. Columns -----------------------------------------------------------------
ALTER TABLE "InboxConversation"
  ADD COLUMN IF NOT EXISTS "assignedToId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);

ALTER TABLE "InboxMessage"
  ADD COLUMN IF NOT EXISTS "authorId" TEXT,
  ADD COLUMN IF NOT EXISTS "kind" "InboxMessageKind" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN IF NOT EXISTS "mediaFilename" TEXT,
  ADD COLUMN IF NOT EXISTS "mediaMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT;

-- Existing threads already know when the customer last wrote; without this
-- backfill every one of them would look like its service window had expired.
UPDATE "InboxConversation" c
SET "lastInboundAt" = latest.at
FROM (
  SELECT "conversationId", MAX(COALESCE("receivedAt", "createdAt")) AS at
  FROM "InboxMessage"
  WHERE "direction" = 'INBOUND'
  GROUP BY 1
) latest
WHERE latest."conversationId" = c.id AND c."lastInboundAt" IS NULL;

-- 3. Tables ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "InboxNote" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InboxNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InboxLabel" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#71717a',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InboxLabel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InboxQuickReply" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "shortcut" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InboxQuickReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "_InboxConversationLabels" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

-- 4. Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "InboxNote_conversationId_createdAt_idx"
  ON "InboxNote" ("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "InboxNote_workspaceId_idx"
  ON "InboxNote" ("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "InboxLabel_workspaceId_name_key"
  ON "InboxLabel" ("workspaceId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "InboxQuickReply_workspaceId_shortcut_key"
  ON "InboxQuickReply" ("workspaceId", "shortcut");
CREATE UNIQUE INDEX IF NOT EXISTS "_InboxConversationLabels_AB_unique"
  ON "_InboxConversationLabels" ("A", "B");
CREATE INDEX IF NOT EXISTS "_InboxConversationLabels_B_index"
  ON "_InboxConversationLabels" ("B");
CREATE INDEX IF NOT EXISTS "InboxConversation_workspaceId_assignedToId_idx"
  ON "InboxConversation" ("workspaceId", "assignedToId");

-- 5. Foreign keys ------------------------------------------------------------
-- Scoped by conrelid: constraint names are unique per table, not per schema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InboxConversation_assignedToId_fkey'
      AND conrelid = '"InboxConversation"'::regclass
  ) THEN
    ALTER TABLE "InboxConversation"
      ADD CONSTRAINT "InboxConversation_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InboxMessage_authorId_fkey'
      AND conrelid = '"InboxMessage"'::regclass
  ) THEN
    ALTER TABLE "InboxMessage"
      ADD CONSTRAINT "InboxMessage_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InboxNote_workspaceId_fkey'
      AND conrelid = '"InboxNote"'::regclass
  ) THEN
    ALTER TABLE "InboxNote"
      ADD CONSTRAINT "InboxNote_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InboxNote_conversationId_fkey'
      AND conrelid = '"InboxNote"'::regclass
  ) THEN
    ALTER TABLE "InboxNote"
      ADD CONSTRAINT "InboxNote_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InboxNote_authorId_fkey'
      AND conrelid = '"InboxNote"'::regclass
  ) THEN
    ALTER TABLE "InboxNote"
      ADD CONSTRAINT "InboxNote_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InboxLabel_workspaceId_fkey'
      AND conrelid = '"InboxLabel"'::regclass
  ) THEN
    ALTER TABLE "InboxLabel"
      ADD CONSTRAINT "InboxLabel_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InboxQuickReply_workspaceId_fkey'
      AND conrelid = '"InboxQuickReply"'::regclass
  ) THEN
    ALTER TABLE "InboxQuickReply"
      ADD CONSTRAINT "InboxQuickReply_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '_InboxConversationLabels_A_fkey'
      AND conrelid = '"_InboxConversationLabels"'::regclass
  ) THEN
    ALTER TABLE "_InboxConversationLabels"
      ADD CONSTRAINT "_InboxConversationLabels_A_fkey"
      FOREIGN KEY ("A") REFERENCES "InboxConversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '_InboxConversationLabels_B_fkey'
      AND conrelid = '"_InboxConversationLabels"'::regclass
  ) THEN
    ALTER TABLE "_InboxConversationLabels"
      ADD CONSTRAINT "_InboxConversationLabels_B_fkey"
      FOREIGN KEY ("B") REFERENCES "InboxLabel"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
