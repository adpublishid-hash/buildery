-- An order whose payment was captured but whose fulfilment could not finish.
--
-- Before this the coupon and stock checks threw after the order had already
-- been marked PAID, rolling the whole transaction back: the buyer's money was
-- taken at the provider, the order stayed PENDING, and the webhook returned
-- 500 so the gateway retried the same failure forever.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "needsAttention" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attentionReason" TEXT;

-- Small and highly selective: the dashboard filters on it.
CREATE INDEX IF NOT EXISTS "Order_workspaceId_needsAttention_idx"
  ON "Order" ("workspaceId", "needsAttention");
