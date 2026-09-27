-- Header dan footer situs yang dipakai bersama semua halaman.
--
-- Sebelumnya setiap halaman membawa blok Header dan Footer-nya sendiri, jadi
-- mengganti satu tautan menu berarti menyunting setiap halaman, dan lama-lama
-- header antar halaman saling berbeda.
--
-- Idempoten supaya aman dijalankan ulang.

ALTER TABLE "Website"
  ADD COLUMN IF NOT EXISTS "siteHeader" JSONB,
  ADD COLUMN IF NOT EXISTS "siteFooter" JSONB;
