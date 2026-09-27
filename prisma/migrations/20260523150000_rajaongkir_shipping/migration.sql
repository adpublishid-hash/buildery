-- AlterTable: EcommerceSetting — RajaOngkir API key + origin + courier set.
ALTER TABLE "EcommerceSetting"
    ADD COLUMN "rajaOngkirApiKey" TEXT,
    ADD COLUMN "shippingOriginCityId" TEXT,
    ADD COLUMN "shippingOriginCityName" TEXT,
    ADD COLUMN "shippingCouriers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: Order — shipping fields.
ALTER TABLE "Order"
    ADD COLUMN "shippingCost" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "shippingProvinceId" TEXT,
    ADD COLUMN "shippingProvinceName" TEXT,
    ADD COLUMN "shippingCityId" TEXT,
    ADD COLUMN "shippingCityName" TEXT,
    ADD COLUMN "shippingPostalCode" TEXT,
    ADD COLUMN "shippingAddress" TEXT,
    ADD COLUMN "shippingRecipientName" TEXT,
    ADD COLUMN "shippingRecipientPhone" TEXT,
    ADD COLUMN "shippingCourier" TEXT,
    ADD COLUMN "shippingService" TEXT,
    ADD COLUMN "shippingEtd" TEXT;
