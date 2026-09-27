-- SiteTemplate menyimpan kontennya sendiri.
--
-- Sebelumnya modelnya hanya metadata, sehingga template yang dibuat admin
-- tidak pernah bisa muncul di builder — builder membaca daftar template dari
-- array hardcode di kode.
--
-- Idempoten supaya aman dijalankan ulang.

ALTER TABLE "SiteTemplate"
  ADD COLUMN IF NOT EXISTS "blocks"       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "blockCount"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "designTokens" JSONB,
  ADD COLUMN IF NOT EXISTS "category"     TEXT,
  ADD COLUMN IF NOT EXISTS "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "createdById"  TEXT;

DO $$
BEGIN
  ALTER TABLE "SiteTemplate"
    ADD CONSTRAINT "SiteTemplate_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "SiteTemplate"
    ADD CONSTRAINT "SiteTemplate_blockCount_nonnegative"
      CHECK ("blockCount" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS "SiteTemplate_isPublished_sortOrder_idx"
  ON "SiteTemplate" ("isPublished", "sortOrder");
CREATE INDEX IF NOT EXISTS "SiteTemplate_createdById_idx"
  ON "SiteTemplate" ("createdById");

-- Template lama tidak punya blok sama sekali, jadi tidak ada yang bisa
-- diterapkan darinya. Tarik dari publikasi supaya tidak tampil kosong di
-- builder; admin bisa mengisinya lalu menerbitkan ulang.
UPDATE "SiteTemplate"
SET "isPublished" = false
WHERE "isPublished" = true
  AND ("blocks" IS NULL OR jsonb_array_length("blocks") = 0);
