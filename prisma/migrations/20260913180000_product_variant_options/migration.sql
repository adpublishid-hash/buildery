-- Option axes for product variants.
--
-- Variants existed as a flat list with a hand-typed name ("Hitam / XL"), so a
-- shop with 3 colours and 4 sizes meant creating and naming twelve rows by
-- hand, consistently, and the storefront could only show that flat list.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "variantOptions" JSONB NOT NULL DEFAULT '[]';
