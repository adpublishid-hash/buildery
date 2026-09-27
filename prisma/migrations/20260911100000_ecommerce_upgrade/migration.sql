CREATE TYPE "ManualPaymentProofStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "ProductReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');
CREATE TYPE "ShippingMethodType" AS ENUM ('AUTOMATIC', 'FLAT_RATE', 'FREE', 'PICKUP');

ALTER TABLE "Product" ADD COLUMN "costPrice" INTEGER DEFAULT 0;
ALTER TABLE "Order"
  ADD COLUMN "checkoutRequestId" TEXT,
  ADD COLUMN "customerNameSnapshot" TEXT,
  ADD COLUMN "customerEmailSnapshot" TEXT,
  ADD COLUMN "customerPhoneSnapshot" TEXT,
  ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "shippingMethodType" "ShippingMethodType",
  ADD COLUMN "shippingMethodName" TEXT;
ALTER TABLE "EcommerceSetting"
  ADD COLUMN "flatRateEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "flatRateName" TEXT NOT NULL DEFAULT 'Flat rate',
  ADD COLUMN "flatRateCost" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "freeShippingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "freeShippingMinimum" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "invoicePrefix" TEXT NOT NULL DEFAULT 'INV';
ALTER TABLE "OrderItem"
  ADD COLUMN "variantId" TEXT,
  ADD COLUMN "skuSnapshot" TEXT,
  ADD COLUMN "variantSnapshot" JSONB;
ALTER TABLE "Payment"
  ADD COLUMN "manualProofUrl" TEXT,
  ADD COLUMN "manualProofNote" TEXT,
  ADD COLUMN "manualProofStatus" "ManualPaymentProofStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN "manualProofSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "manualProofReviewedAt" TIMESTAMP(3),
  ADD COLUMN "manualProofReviewedById" TEXT;
ALTER TABLE "Coupon"
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "minimumPurchase" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxUsesPerCustomer" INTEGER,
  ADD COLUMN "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "freeShipping" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProductVariant" (
  "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "sku" TEXT, "price" INTEGER, "stock" INTEGER NOT NULL DEFAULT 0,
  "weightGrams" INTEGER, "imageUrl" TEXT, "options" JSONB NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProductReview" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "customerId" TEXT, "orderItemId" TEXT, "status" "ProductReviewStatus" NOT NULL DEFAULT 'PENDING',
  "rating" INTEGER NOT NULL, "title" TEXT, "body" TEXT, "customerName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WishlistItem" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Order_checkoutRequestId_key" ON "Order"("checkoutRequestId");
CREATE UNIQUE INDEX "Order_workspaceId_invoiceNumber_key" ON "Order"("workspaceId", "invoiceNumber");
CREATE UNIQUE INDEX "ProductVariant_productId_name_key" ON "ProductVariant"("productId", "name");
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");
CREATE UNIQUE INDEX "ProductReview_orderItemId_key" ON "ProductReview"("orderItemId");
CREATE INDEX "ProductReview_workspaceId_status_createdAt_idx" ON "ProductReview"("workspaceId", "status", "createdAt");
CREATE INDEX "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");
CREATE INDEX "ProductReview_customerId_idx" ON "ProductReview"("customerId");
CREATE UNIQUE INDEX "WishlistItem_customerId_productId_key" ON "WishlistItem"("customerId", "productId");
CREATE INDEX "WishlistItem_workspaceId_createdAt_idx" ON "WishlistItem"("workspaceId", "createdAt");
CREATE INDEX "WishlistItem_productId_idx" ON "WishlistItem"("productId");
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");
