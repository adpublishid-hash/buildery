-- AlterEnum (add QRIS before OTHER)
ALTER TYPE "ManualPaymentMethodType" ADD VALUE 'QRIS' BEFORE 'OTHER';

-- AlterTable
ALTER TABLE "ManualPaymentMethod" ADD COLUMN "qrImageUrl" TEXT;
