-- "Tell me when it's back": a sold-out page used to be a dead end.

ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'STOCK_NOTIFY_SWEEP';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'BACK_IN_STOCK';

CREATE TABLE IF NOT EXISTS "StockNotification" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "targetKey" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StockNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockNotification_workspaceId_notifiedAt_idx"
  ON "StockNotification" ("workspaceId", "notifiedAt");
CREATE INDEX IF NOT EXISTS "StockNotification_productId_idx"
  ON "StockNotification" ("productId");
-- targetKey carries the variant, so one person cannot sign up twice for the
-- same thing: a nullable variantId would make every NULL row distinct.
CREATE UNIQUE INDEX IF NOT EXISTS "StockNotification_workspaceId_targetKey_email_key"
  ON "StockNotification" ("workspaceId", "targetKey", "email");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StockNotification_workspaceId_fkey'
      AND conrelid = '"StockNotification"'::regclass
  ) THEN
    ALTER TABLE "StockNotification"
      ADD CONSTRAINT "StockNotification_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StockNotification_productId_fkey'
      AND conrelid = '"StockNotification"'::regclass
  ) THEN
    ALTER TABLE "StockNotification"
      ADD CONSTRAINT "StockNotification_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StockNotification_variantId_fkey'
      AND conrelid = '"StockNotification"'::regclass
  ) THEN
    ALTER TABLE "StockNotification"
      ADD CONSTRAINT "StockNotification_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
