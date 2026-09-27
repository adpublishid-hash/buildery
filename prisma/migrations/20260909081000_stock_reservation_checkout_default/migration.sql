ALTER TABLE "EcommerceSetting"
  ALTER COLUMN "stockDecrementTiming" SET DEFAULT 'CHECKOUT';

UPDATE "EcommerceSetting"
SET "stockDecrementTiming" = 'CHECKOUT'
WHERE "stockDecrementTiming" = 'PAID';
