-- Declares four indexes production already has. They were created by migrations
-- from the retired staging lineage (20260524223000_course_linked_product,
-- 20260524231500_store_notification_cleared_at, 20260518154000_inbox_whatsapp,
-- 20260904230000_product_variants) whose files are not in this repository, so
-- `migrate diff` proposed dropping them. They are useful — the topbar bell now
-- filters on (workspaceId, clearedAt) — so the schema adopts them instead.
-- Idempotent: a no-op on production, creates them everywhere else.

CREATE INDEX IF NOT EXISTS "Course_productId_idx" ON "Course"("productId");

CREATE INDEX IF NOT EXISTS "ProductVariant_productId_isActive_sortOrder_idx" ON "ProductVariant"("productId", "isActive", "sortOrder");

CREATE INDEX IF NOT EXISTS "StoreNotification_inboxMessageId_idx" ON "StoreNotification"("inboxMessageId");

CREATE INDEX IF NOT EXISTS "StoreNotification_workspaceId_clearedAt_createdAt_idx" ON "StoreNotification"("workspaceId", "clearedAt", "createdAt");
