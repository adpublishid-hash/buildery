# Blog Optimization Roadmap

Dokumen ini merangkum upgrade modul blog yang telah diterapkan pada 18 Sep
2026. Cakupannya meliputi dashboard editorial, publication lifecycle, halaman
publik, SEO, keamanan media, analytics, dan integrasi page builder.

**Status: seluruh prioritas utama sudah diimplementasikan.**

## 1. Publication lifecycle dan versioning

- Status post mendukung `DRAFT`, `SCHEDULED`, `PUBLISHED`, dan `ARCHIVED`.
- Publish dan schedule membuat snapshot `BlogPostVersion` yang immutable.
- Edit draft tidak langsung mengubah artikel yang sedang live.
- Versi lama dapat dipulihkan ke editor tanpa menimpa histori publik.
- Perubahan slug publik dicatat di `BlogSlugHistory` dan URL lama melakukan
  permanent redirect ke slug terbaru.
- Scheduled publication memakai job queue `BLOG_PUBLICATION`, dedupe key, dan
  retry worker yang sudah tersedia di sistem.

## 2. Editorial workflow

- Editor mendukung autosave untuk post yang sudah tersimpan.
- Ada peringatan browser ketika perubahan belum tersimpan.
- Preview privat memakai draft terbaru dan tetap dilindungi autentikasi
  workspace.
- Kontrol featured post, waktu publish, archive, duplicate, dan version restore
  tersedia dari editor atau daftar post.
- Kategori dan tag dapat dibuat, diubah, digabung, dan dihapus tanpa melewati
  batas workspace.

## 3. SEO dan distribusi

- Article dan Breadcrumb JSON-LD tersedia pada halaman artikel.
- Open Graph, Twitter Card, canonical URL, `noindex`, image alt, dan caption
  dapat dikontrol per post.
- Blog index memakai canonical yang benar untuk pagination dan `noindex` untuk
  hasil pencarian atau taxonomy filter.
- RSS 2.0 tersedia di `/blog/feed.xml` dan diumumkan melalui metadata halaman.
- Sitemap memakai slug versi publik, memuat blog index, feed, dan artikel live.

## 4. Performa dan konsistensi publik

- Semua permukaan publik membaca snapshot yang sama, termasuk halaman blog,
  related posts, RSS, sitemap, storefront navigation, dan blog showcase pada
  page builder.
- Query publik memakai cache bertag per workspace dengan invalidasi saat
  publish, archive, taxonomy berubah, atau post dihapus.
- Pencarian artikel dijalankan di PostgreSQL memakai full-text search, bukan
  memindai HTML di browser.
- Post terjadwal yang menggantikan artikel live tetap menampilkan versi live
  lama sampai jadwal baru dipromosikan.

## 5. Security, limits, dan media

- Cover image diverifikasi harus berasal dari workspace aktif.
- Upload gambar memverifikasi magic bytes dan menolak MIME palsu.
- Batas `blogPostLimit` paket SaaS ditegakkan saat membuat atau menggandakan
  post.
- Upload cover lama dibersihkan hanya jika tidak lagi dipakai produk, course,
  variant, draft blog, body artikel, atau snapshot versi.
- Slug diperiksa terhadap draft, slug publik, dan seluruh histori redirect.

## 6. Analytics

- Event `VIEW`, `READ_COMPLETE`, dan `SHARE` direkam melalui endpoint publik
  yang rate-limited.
- Read completion dipicu setelah pembaca mencapai 85% halaman.
- Dashboard menampilkan view, completion rate, share, dan ringkasan status
  editorial.

## 7. Verifikasi

- Migration: `20260918100000_blog_lifecycle_upgrade`.
- Prisma schema format, validate, dan client generation lulus.
- TypeScript (`tsc --noEmit`) lulus.
- Production build Next.js lulus.
- Test lifecycle mencakup snapshot immutable, republish, histori slug, query
  publik, scheduled publication, dan sitemap.

Catatan operasional: endpoint job runner yang sudah dipakai aplikasi harus
tetap dipanggil scheduler agar artikel terjadwal dipublikasikan tepat waktu.
