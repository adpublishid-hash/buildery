UPDATE "Product"
SET "type" = 'DIGITAL'
WHERE "type" IN ('SERVICE', 'EVENT');

ALTER TYPE "ProductType" RENAME TO "ProductType_old";
CREATE TYPE "ProductType" AS ENUM ('PHYSICAL', 'DIGITAL');

ALTER TABLE "Product"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "ProductType"
  USING ("type"::text::"ProductType"),
  ALTER COLUMN "type" SET DEFAULT 'PHYSICAL';

DROP TYPE "ProductType_old";
