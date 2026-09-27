-- A cart that outlives the browser.
--
-- Carts lived only in a cookie: they vanished when a shopper moved from phone
-- to laptop, and anyone who stopped at the cart page was invisible, because
-- abandonment tracking only began once an order existed.

CREATE TABLE IF NOT EXISTS "Cart" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT,
  "visitorId" TEXT,
  "couponCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CartItem" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- One cart per signed-in customer per shop; NULLs stay distinct, which is what
-- lets many anonymous carts coexist.
CREATE UNIQUE INDEX IF NOT EXISTS "Cart_workspaceId_customerId_key"
  ON "Cart" ("workspaceId", "customerId");
CREATE INDEX IF NOT EXISTS "Cart_workspaceId_updatedAt_idx"
  ON "Cart" ("workspaceId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Cart_visitorId_idx" ON "Cart" ("visitorId");
CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_cartId_productId_variantId_key"
  ON "CartItem" ("cartId", "productId", "variantId");
CREATE INDEX IF NOT EXISTS "CartItem_cartId_idx" ON "CartItem" ("cartId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cart_workspaceId_fkey' AND conrelid = '"Cart"'::regclass) THEN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cart_customerId_fkey' AND conrelid = '"Cart"'::regclass) THEN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_cartId_fkey' AND conrelid = '"CartItem"'::regclass) THEN
    ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
      FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_productId_fkey' AND conrelid = '"CartItem"'::regclass) THEN
    ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_variantId_fkey' AND conrelid = '"CartItem"'::regclass) THEN
    ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
