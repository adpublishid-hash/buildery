-- Tiga blok baru yang umum di landing page pasar Indonesia: tombol WhatsApp
-- mengambang, peta lokasi, dan tab.
--
-- IF NOT EXISTS supaya aman dijalankan ulang. Nilai enum baru tidak dipakai
-- di transaksi yang sama, jadi aman di dalam transaksi migrasi Prisma.
ALTER TYPE "BlockType" ADD VALUE IF NOT EXISTS 'WHATSAPP_FLOAT';
ALTER TYPE "BlockType" ADD VALUE IF NOT EXISTS 'MAP';
ALTER TYPE "BlockType" ADD VALUE IF NOT EXISTS 'TABS';
