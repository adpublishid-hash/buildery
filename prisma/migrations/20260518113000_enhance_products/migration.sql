ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'SERVICE';
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'EVENT';

CREATE TYPE "ProductPricingMode" AS ENUM ('ONE_TIME', 'SUBSCRIPTION');

ALTER TABLE "Product"
  ADD COLUMN "details" TEXT,
  ADD COLUMN "pricingMode" "ProductPricingMode" NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "lowStockThreshold" INTEGER,
  ADD COLUMN "metaTitle" TEXT,
  ADD COLUMN "metaDescription" TEXT,
  ADD COLUMN "downloadUrl" TEXT,
  ADD COLUMN "downloadLabel" TEXT,
  ADD COLUMN "serviceLocation" TEXT,
  ADD COLUMN "serviceDurationMinutes" INTEGER,
  ADD COLUMN "eventStartsAt" TIMESTAMP(3),
  ADD COLUMN "eventEndsAt" TIMESTAMP(3),
  ADD COLUMN "eventLocation" TEXT,
  ADD COLUMN "weightGrams" INTEGER,
  ADD COLUMN "lengthCm" INTEGER,
  ADD COLUMN "widthCm" INTEGER,
  ADD COLUMN "heightCm" INTEGER,
  ADD COLUMN "galleryImageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
