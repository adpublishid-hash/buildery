CREATE TYPE "CurrencySymbolPosition" AS ENUM ('LEFT', 'RIGHT', 'LEFT_SPACE', 'RIGHT_SPACE');
CREATE TYPE "PaymentTimeoutUnit" AS ENUM ('MINUTES', 'HOURS', 'DAYS');
CREATE TYPE "StockDecrementTiming" AS ENUM ('PAID');
CREATE TYPE "ManualPaymentMethodType" AS ENUM ('BANK_TRANSFER', 'EWALLET', 'OTHER');

CREATE TABLE "EcommerceSetting" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'IDR',
  "currencyLocale" TEXT NOT NULL DEFAULT 'id-ID',
  "currencySymbol" TEXT NOT NULL DEFAULT 'Rp',
  "currencySymbolPosition" "CurrencySymbolPosition" NOT NULL DEFAULT 'LEFT',
  "thousandSeparator" TEXT NOT NULL DEFAULT '.',
  "decimalSeparator" TEXT NOT NULL DEFAULT ',',
  "decimalPlaces" INTEGER NOT NULL DEFAULT 0,
  "checkoutRequireLogin" BOOLEAN NOT NULL DEFAULT false,
  "checkoutAutoCreateAccount" BOOLEAN NOT NULL DEFAULT true,
  "checkoutCouponEnabled" BOOLEAN NOT NULL DEFAULT true,
  "checkoutSellerNoteEnabled" BOOLEAN NOT NULL DEFAULT true,
  "orderNumberPrefix" TEXT,
  "paymentTimeoutValue" INTEGER NOT NULL DEFAULT 24,
  "paymentTimeoutUnit" "PaymentTimeoutUnit" NOT NULL DEFAULT 'HOURS',
  "defaultDimensionUnit" TEXT NOT NULL DEFAULT 'CM',
  "defaultWeightUnit" TEXT NOT NULL DEFAULT 'KG',
  "stockDecrementTiming" "StockDecrementTiming" NOT NULL DEFAULT 'PAID',
  "orderSoundNew" BOOLEAN NOT NULL DEFAULT false,
  "orderSoundPaid" BOOLEAN NOT NULL DEFAULT false,
  "shippingAggregatorApiKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EcommerceSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualPaymentMethod" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "settingId" TEXT NOT NULL,
  "type" "ManualPaymentMethodType" NOT NULL DEFAULT 'BANK_TRANSFER',
  "name" TEXT NOT NULL,
  "accountName" TEXT,
  "accountNumber" TEXT,
  "instructions" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PickupLocation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "settingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT,
  "province" TEXT,
  "postalCode" TEXT,
  "phone" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PickupLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EcommerceSetting_workspaceId_key" ON "EcommerceSetting"("workspaceId");
CREATE INDEX "ManualPaymentMethod_workspaceId_idx" ON "ManualPaymentMethod"("workspaceId");
CREATE INDEX "ManualPaymentMethod_settingId_idx" ON "ManualPaymentMethod"("settingId");
CREATE INDEX "PickupLocation_workspaceId_idx" ON "PickupLocation"("workspaceId");
CREATE INDEX "PickupLocation_settingId_idx" ON "PickupLocation"("settingId");

ALTER TABLE "EcommerceSetting" ADD CONSTRAINT "EcommerceSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualPaymentMethod" ADD CONSTRAINT "ManualPaymentMethod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualPaymentMethod" ADD CONSTRAINT "ManualPaymentMethod_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "EcommerceSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickupLocation" ADD CONSTRAINT "PickupLocation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickupLocation" ADD CONSTRAINT "PickupLocation_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "EcommerceSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
