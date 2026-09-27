-- Inbox hardening: one conversation per phone number, one message per
-- provider message id, and an index that can serve the inbox list's sort.
--
-- Idempotent throughout: re-running finds nothing left to normalise and the
-- indexes are created only when missing.

-- 1. Merge conversations that differ only by punctuation in the phone number.
--    "+62812…" arrived from the dashboard and "62812…" from the WhatsApp
--    webhook, so the same customer could hold two separate threads.
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT c.id AS from_id, k.keep_id AS to_id
    FROM "InboxConversation" c
    JOIN (
      SELECT
        "workspaceId",
        "channel",
        regexp_replace("contactPhone", '[^0-9]', '', 'g') AS norm,
        -- Prefer a row already stored in normalised form, then the most
        -- recently active one.
        (array_agg(
          id
          ORDER BY
            ("contactPhone" = regexp_replace("contactPhone", '[^0-9]', '', 'g')) DESC,
            "lastMessageAt" DESC NULLS LAST,
            "createdAt" ASC
        ))[1] AS keep_id
      FROM "InboxConversation"
      WHERE regexp_replace("contactPhone", '[^0-9]', '', 'g') <> ''
      GROUP BY 1, 2, 3
    ) k
      ON k."workspaceId" = c."workspaceId"
     AND k."channel" = c."channel"
     AND k.norm = regexp_replace(c."contactPhone", '[^0-9]', '', 'g')
    WHERE c.id <> k.keep_id
  LOOP
    UPDATE "InboxMessage"
      SET "conversationId" = dup.to_id
      WHERE "conversationId" = dup.from_id;

    UPDATE "InboxConversation" t
      SET
        "unreadCount" = t."unreadCount" + c."unreadCount",
        "customerId" = COALESCE(t."customerId", c."customerId"),
        "contactName" = COALESCE(t."contactName", c."contactName"),
        "lastMessagePreview" = CASE
          WHEN c."lastMessageAt" IS NOT NULL
           AND (t."lastMessageAt" IS NULL OR c."lastMessageAt" > t."lastMessageAt")
          THEN c."lastMessagePreview"
          ELSE t."lastMessagePreview"
        END,
        -- GREATEST ignores NULLs in Postgres, so an untouched thread stays NULL.
        "lastMessageAt" = GREATEST(t."lastMessageAt", c."lastMessageAt")
      FROM "InboxConversation" c
      WHERE t.id = dup.to_id AND c.id = dup.from_id;

    DELETE FROM "InboxConversation" WHERE id = dup.from_id;
  END LOOP;
END $$;

-- 2. Store every remaining number in the same shape: digits only.
UPDATE "InboxConversation"
SET "contactPhone" = regexp_replace("contactPhone", '[^0-9]', '', 'g')
WHERE "contactPhone" <> regexp_replace("contactPhone", '[^0-9]', '', 'g')
  AND regexp_replace("contactPhone", '[^0-9]', '', 'g') <> '';

-- 3. Drop messages a provider delivered more than once, keeping the first.
DELETE FROM "InboxMessage" m
WHERE m."providerMessageId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "InboxMessage" o
    WHERE o."workspaceId" = m."workspaceId"
      AND o."providerMessageId" = m."providerMessageId"
      AND (o."createdAt" < m."createdAt"
        OR (o."createdAt" = m."createdAt" AND o.id < m.id))
  );

-- 4. Enforce it from here on, and index the inbox list's ordering.
CREATE UNIQUE INDEX IF NOT EXISTS "InboxMessage_workspaceId_providerMessageId_key"
  ON "InboxMessage" ("workspaceId", "providerMessageId");

CREATE INDEX IF NOT EXISTS "InboxConversation_workspaceId_lastMessageAt_idx"
  ON "InboxConversation" ("workspaceId", "lastMessageAt");
