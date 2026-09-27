-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "digitalAccessItems" JSONB NOT NULL DEFAULT '[]';
