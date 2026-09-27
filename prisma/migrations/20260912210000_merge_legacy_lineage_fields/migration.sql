-- Fields and enum values the production lineage carried that the merged
-- schema had no home for.
--
-- Declaring them keeps schema reconciliation additive: without this, a diff
-- against a database from the older lineage proposes dropping live columns.
-- Additive only -- the generated diff's DROPs were removed, because what they
-- target is drift both databases have carried since the fork, all of it empty.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "FormFieldType" ADD VALUE 'CUSTOM';
ALTER TYPE "FormFieldType" ADD VALUE 'REPEATER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "ScheduledJobKind" ADD VALUE 'ABANDONED_SCAN';
ALTER TYPE "ScheduledJobKind" ADD VALUE 'ABANDONED_RECOVERY';
ALTER TYPE "ScheduledJobKind" ADD VALUE 'NOTIFICATION_RETRY';
ALTER TYPE "ScheduledJobKind" ADD VALUE 'WHATSAPP_SEND';
ALTER TYPE "ScheduledJobKind" ADD VALUE 'LOW_STOCK_SCAN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "StoreNotificationEvent" ADD VALUE 'ABANDONED_RECOVERY';
ALTER TYPE "StoreNotificationEvent" ADD VALUE 'LOW_STOCK';

-- AlterTable
ALTER TABLE "AbandonedCheckoutRecovery" ADD COLUMN     "automated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "recoveryCouponCode" TEXT;

-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "isPopular" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "EcommerceSetting" ADD COLUMN     "abandonedRecoveryCouponDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "abandonedRecoveryCouponEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "abandonedRecoveryCouponPercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "abandonedRecoveryDelayMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "abandonedRecoveryEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "abandonedRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "abandonedRecoveryIntervalHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "abandonedRecoveryMaxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "abandonedRecoveryWhatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "invoiceNotes" TEXT,
ADD COLUMN     "midtransClientKey" TEXT,
ADD COLUMN     "midtransEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "midtransIsProduction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "midtransServerKey" TEXT,
ADD COLUMN     "sellerAddress" TEXT,
ADD COLUMN     "sellerEmail" TEXT,
ADD COLUMN     "sellerName" TEXT,
ADD COLUMN     "sellerPhone" TEXT,
ADD COLUMN     "sellerTaxId" TEXT,
ADD COLUMN     "taxLabel" TEXT NOT NULL DEFAULT 'PPN';

-- AlterTable
ALTER TABLE "IntegrationSetting" ADD COLUMN     "oneSenderEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "invoiceIssuedAt" TIMESTAMP(3),
ADD COLUMN     "refundedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxLabel" TEXT,
ADD COLUMN     "taxRateBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "variantNameSnapshot" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "orderViaWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxExempt" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "discountPrice" INTEGER,
ADD COLUMN     "imageId" TEXT,
ADD COLUMN     "lowStockAlertedAt" TIMESTAMP(3),
ADD COLUMN     "lowStockThreshold" INTEGER,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaaSPlan" ADD COLUMN     "blogPostLimit" INTEGER,
ADD COLUMN     "customDomainEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customerLimit" INTEGER,
ADD COLUMN     "formLimit" INTEGER,
ADD COLUMN     "monthlyOrderLimit" INTEGER,
ADD COLUMN     "orderRetentionMonths" INTEGER;

-- AlterTable
ALTER TABLE "StoreNotification" ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "inboxMessageId" TEXT;

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_workspaceId_createdAt_idx" ON "Refund"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "UploadFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
