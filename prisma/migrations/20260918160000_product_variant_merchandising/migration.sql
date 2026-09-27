ALTER TABLE "ProductVariant" ADD COLUMN "costPrice" INTEGER;

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_costPrice_nonnegative" CHECK ("costPrice" IS NULL OR "costPrice" >= 0),
  ADD CONSTRAINT "ProductVariant_discountPrice_nonnegative" CHECK ("discountPrice" IS NULL OR "discountPrice" >= 0),
  ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("price" IS NULL OR "price" >= 0),
  ADD CONSTRAINT "ProductVariant_discount_below_price" CHECK (
    "discountPrice" IS NULL OR "price" IS NULL OR "discountPrice" < "price"
  );
