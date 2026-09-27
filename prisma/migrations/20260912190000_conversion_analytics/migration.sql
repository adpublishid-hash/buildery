-- AlterEnum
ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'VIEW_CONTENT';
ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'ADD_TO_CART';
ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'BEGIN_CHECKOUT';
ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'PURCHASE';

-- AlterTable
ALTER TABLE "AnalyticsEvent"
  ADD COLUMN IF NOT EXISTS "visitorId" TEXT,
  ADD COLUMN IF NOT EXISTS "utmSource" TEXT,
  ADD COLUMN IF NOT EXISTS "utmMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "utmContent" TEXT,
  ADD COLUMN IF NOT EXISTS "utmTerm" TEXT,
  ADD COLUMN IF NOT EXISTS "value" INTEGER,
  ADD COLUMN IF NOT EXISTS "orderId" TEXT,
  ADD COLUMN IF NOT EXISTS "productId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_workspaceId_type_createdAt_idx" ON "AnalyticsEvent"("workspaceId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_workspaceId_visitorId_idx" ON "AnalyticsEvent"("workspaceId", "visitorId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_orderId_idx" ON "AnalyticsEvent"("orderId");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" DROP CONSTRAINT IF EXISTS "AnalyticsEvent_orderId_fkey";
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" DROP CONSTRAINT IF EXISTS "AnalyticsEvent_productId_fkey";
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
