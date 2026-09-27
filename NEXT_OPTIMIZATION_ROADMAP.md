# Next Optimization Roadmap — Status

Roadmap aslinya tersimpan di `.deploy-staging/NEXT_OPTIMIZATION_ROADMAP.md`,
tetapi isinya menggambarkan kode **direktori ini**, bukan `.deploy-staging/`
(file seperti `lib/payment-reconciliation.ts` dan enum `ScheduledJobKind` yang
disebutnya hanya ada di sini). Seluruh keenam prioritas dikerjakan di sini.

Status per 12 Sep 2026:

- `pnpm test` — 39 file, 256 test, lulus (sebelumnya 37 file / 200 test).
- `pnpm test:e2e` — 6 test Playwright, lulus.
- `pnpm build` — lulus.
- `pnpm lint` — bersih (menyisakan satu warning `<img>` yang sudah ada sebelumnya).
- Migrasi Prisma lokal (`localhost:5433`) up to date, 64 migrasi.

> **Sebelum deploy:** direktori ini bukan sumber deploy. Lihat catatan
> divergensi dua arah dengan `.deploy-staging/` — perubahan di bawah perlu
> diport (berikut migrasinya) sebelum bisa dirilis.

## Prioritas 1 — Hardening Public Return Request ✅

Logika intake dipindah dari server action ke service layer agar bisa
diunit-test, sejalan dengan `lib/order-refunds.ts` dan `lib/payment-cancellations.ts`.

- `lib/public-return-requests.ts` (baru) — `submitPublicReturnRequest()`.
- `lib/public-return-limits.ts` (baru) — batas panjang teks, dipakai bersama
  oleh server dan form client (yang tidak boleh mengimpor modul `server-only`).
- `lib/actions/order.ts` — `requestOrderReturnAction` kini wrapper tipis.
- `components/store/return-request-form.tsx` — `maxLength` pada reason/note.
- `test/public-return-requests.test.ts` (baru) — 27 test.

Yang diterapkan:

- Rate limit per IP `order-return-request` (5 / 10 menit) **sebelum** menyentuh DB.
- Rate limit kedua per order (3 / 10 menit), dibelanjakan **hanya setelah**
  token terbukti valid — tanpa `TRUST_PROXY` semua klien terhitung satu IP,
  jadi limit per-order inilah yang benar-benar mencegah satu order dispam.
- Anti-duplikat: request identik (amount + set item yang sama) ditolak selama
  masih ada refund/return berstatus `REQUESTED`/`APPROVED`.
- Reason maks 500 karakter, note maks 1000 — **ditolak**, bukan dipotong diam-diam.
- Slug toko tidak dikenal dan token palsu memberi pesan yang sama, supaya
  tidak membocorkan order/toko mana yang ada.

## Prioritas 2 — Action Buttons di Payment Audit ✅

- `lib/actions/payment-audit.ts` (baru) — empat action, semuanya memeriksa
  `canInWorkspace(role, "content.edit")` dan dibatasi per workspace.
- `components/payments/payment-audit-actions.tsx` (baru) — tombol + toast +
  `router.refresh()`.
- `app/dashboard/payments/audit/page.tsx` — kolom "Tindakan" pada tiga tabel.
- `lib/payment-reconciliation.ts` — loop sweep diekstrak jadi
  `reconcileOnePayment()`, lalu dipakai ulang oleh `reconcileMidtransPayment()`
  untuk satu payment.
- `lib/payments.ts` — `expireOverduePayment()` untuk satu payment.

Keempat action bersifat idempotent: masing-masing membaca ulang state terkini
dan menolak dengan alasan jelas kalau baris sudah final (`"Payment ini sudah
final."`, `"Payment ini belum melewati batas waktu."`).

Test: `test/payment-reconciliation.test.ts` (+7), `test/payment-expiry.test.ts` (+7).

## Prioritas 3 — Job Runner Health Dashboard ✅

- `lib/jobs/runner.ts` — `RECURRING_JOBS` dan `STALE_LOCK_MS` diekspor sebagai
  satu sumber kebenaran.
- `lib/jobs/health.ts` (baru) — `getJobHealth()`.
- `app/dashboard/system/jobs/page.tsx` (baru) — dibatasi `workspace.edit`
  (OWNER/ADMIN).
- `lib/labels.ts` — label dan deskripsi per `ScheduledJobKind`.
- `components/dashboard/nav-config.ts` — entri "Payment Audit" dan "Job Runner".
- `test/job-health.test.ts` (baru) — 15 test.

Status yang dibedakan: `STALE` (terkunci `RUNNING` melewati batas reclaim),
`OVERDUE` (pending jauh lewat `runAt`), `FAILED`, `NEVER_RUN`, `RUNNING`,
`SCHEDULED`, `OK`. Masa tenggang "terlambat" berskala dengan interval job
(3× interval, minimum 5 menit), supaya sweep 1 menit tidak beralarm karena
tick yang lambat sementara sweep 30 menit tetap ketahuan kalau benar berhenti.

`JOBS_RUNNER_SECRET` **tidak pernah** dirender — halaman hanya melaporkan
apakah secret-nya terisi.

## Prioritas 4 — Return Evidence Upload ✅

- `prisma/schema.prisma` — model `OrderRefundEvidence` + relasi di `OrderRefund`.
- `prisma/migrations/20260912090000_refund_evidence/` — sudah diterapkan lokal.
- `app/api/site/orders/[orderId]/return-evidence/route.ts` (baru) — upload
  publik yang digerbangi token order, mengikuti pola route payment-proof.
- `lib/upload-constants.ts` — `ALLOWED_EVIDENCE_TYPES` (PNG/JPG/WEBP/PDF),
  `MAX_EVIDENCE_FILES` = 5.
- `components/store/return-request-form.tsx` — lampiran, hapus, ukuran file.
- `components/orders/order-refund-panel.tsx` — evidence tampil di detail order.

Catatan keamanan: metadata evidence datang dari browser, jadi URL-nya
diverifikasi ulang, bukan dipercaya — hanya path yang bisa dihasilkan route
upload untuk workspace **itu** yang diterima. Ini yang mencegah sebuah refund
diarahkan ke upload milik workspace lain. Upload lewat route terpisah, bukan
lewat server action, karena batas body server action jauh di bawah 5 MB.

## Prioritas 5 — E2E Checkout to Refund ✅

- `playwright.config.ts`, `e2e/fixtures/scenario.ts`, `e2e/fixtures/access-token.ts`.
- `e2e/checkout-to-refund.spec.ts` — link afiliasi → add to cart → checkout
  transfer manual → penjual verifikasi pembayaran → customer ajukan return →
  penjual refund → stok kembali (9 → 10), net revenue jadi 0, komisi afiliasi
  ditarik lewat `CommissionAdjustment`.
- `e2e/return-access.spec.ts` — token hilang, palsu, kedaluwarsa, dan milik
  order lain (5 test).
- `components/orders/order-refund-panel.tsx` — atribut `data-refund-id` sebagai
  test hook.

Tidak ada dependensi eksternal: tiap skenario menyemai toko dengan metode
transfer manual sebagai satu-satunya pembayaran, jadi Midtrans tidak pernah
dihubungi. Tiap test menyemai workspace sendiri lalu menghapusnya.

Dua batasan lingkungan yang perlu diketahui:

- Playwright dipin ke `1.49.1`; versi terbaru menolak macOS 12 (`Darwin 21.6`).
- Spec memeriksa halaman not-found yang ter-render, bukan status 404 — dev
  server menjawab `notFound()` dengan 200 yang membawa UI not-found.

## Prioritas 6 — Production Deployment Checklist ✅

- `DEPLOYMENT.md` — bagian **Job runner health check** (cara membaca
  `/dashboard/system/jobs`, arti stale/terlambat/gagal, cara memancing runner
  lewat curl, arti 401 vs 503) dan **Release checklist** (test → e2e → build,
  lalu backup DB, verifikasi `DATABASE_URL`, `migrate deploy`,
  `JOBS_RUNNER_SECRET`, PM2 `buildery-jobs`, webhook Midtrans, Meta Pixel
  per workspace, dan dua halaman yang dicek setelah rilis).
- `TESTING.md` — bagian **End-to-end tests**, ditambah suite unit baru di tabel.

Satu jebakan yang didokumentasikan: tanpa `TRUST_PROXY=true` semua klien
terhitung satu IP, jadi menjalankan spec checkout lebih dari lima kali dalam
sepuluh menit akan gagal karena rate limit, bukan karena regresi.
