-- Product bundles.
--
-- A "beli 3 hemat" package had to be built as a separate product with its own
-- stock number, which then drifted out of step with the products it actually
-- contained. A bundle's stock is derived from its contents instead.

ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'BUNDLE';

CREATE TABLE IF NOT EXISTS "ProductBundleItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductBundleItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductBundleItem_bundleId_productId_variantId_key"
  ON "ProductBundleItem" ("bundleId", "productId", "variantId");
CREATE INDEX IF NOT EXISTS "ProductBundleItem_bundleId_idx"
  ON "ProductBundleItem" ("bundleId");
CREATE INDEX IF NOT EXISTS "ProductBundleItem_productId_idx"
  ON "ProductBundleItem" ("productId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductBundleItem_workspaceId_fkey' AND conrelid = '"ProductBundleItem"'::regclass) THEN
    ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductBundleItem_bundleId_fkey' AND conrelid = '"ProductBundleItem"'::regclass) THEN
    ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_bundleId_fkey"
      FOREIGN KEY ("bundleId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductBundleItem_productId_fkey' AND conrelid = '"ProductBundleItem"'::regclass) THEN
    ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductBundleItem_variantId_fkey' AND conrelid = '"ProductBundleItem"'::regclass) THEN
    ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
