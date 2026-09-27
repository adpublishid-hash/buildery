-- Per-page canonical/noindex, and a memory of the slugs a page used to have.
--
-- Renaming a page 404'd every link already pointing at it — from search
-- results, from a running ad, from a message sent last week.

ALTER TABLE "Page"
  ADD COLUMN IF NOT EXISTS "canonicalUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "noindex" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PageSlugHistory" (
  "id" TEXT NOT NULL,
  "websiteId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PageSlugHistory_pkey" PRIMARY KEY ("id")
);

-- One owner per old address, so a redirect is never ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "PageSlugHistory_websiteId_slug_key"
  ON "PageSlugHistory" ("websiteId", "slug");
CREATE INDEX IF NOT EXISTS "PageSlugHistory_pageId_idx"
  ON "PageSlugHistory" ("pageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PageSlugHistory_pageId_fkey'
      AND conrelid = '"PageSlugHistory"'::regclass
  ) THEN
    ALTER TABLE "PageSlugHistory"
      ADD CONSTRAINT "PageSlugHistory_pageId_fkey"
      FOREIGN KEY ("pageId") REFERENCES "Page"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
