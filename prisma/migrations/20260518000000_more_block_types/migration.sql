-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BlockType" ADD VALUE 'STATS';
ALTER TYPE "BlockType" ADD VALUE 'STEPS';
ALTER TYPE "BlockType" ADD VALUE 'LOGOS';
ALTER TYPE "BlockType" ADD VALUE 'GALLERY';
ALTER TYPE "BlockType" ADD VALUE 'VIDEO';
ALTER TYPE "BlockType" ADD VALUE 'NEWSLETTER';
ALTER TYPE "BlockType" ADD VALUE 'BANNER';
ALTER TYPE "BlockType" ADD VALUE 'DIVIDER';

