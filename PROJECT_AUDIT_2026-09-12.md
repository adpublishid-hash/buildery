# Project Audit — 12 Sep 2026

Analisa kondisi Buildery setelah merge dua fork dan deploy ke produksi hari
ini. Semua temuan diverifikasi terhadap kode di direktori ini, bukan daftar
praktik umum.

## Ukuran

| | |
| --- | --- |
| File TypeScript | 538 |
| Baris kode (app/lib/components) | 104.385 |
| Model Prisma | 88 |
| Migrasi | 66 |
| Route API | 39 |
| Server action | 39 |
| Test | 413 di 53 file |

Ini bukan proyek kecil lagi. Beberapa masalah di bawah muncul justru karena
ukurannya sudah melewati titik di mana disiplin manual masih cukup.

---

## Prioritas 1 — Tidak ada CI

**Bukti:** `.github/workflows/` tidak ada.

413 test yang bagus tidak berguna kalau tidak ada yang menjalankannya sebelum
kode masuk produksi. Hari ini saya membuktikan sendiri biayanya: saya
men-deploy build yang tidak lengkap dan **produksi 502 selama ~1 menit**.
Build-nya gagal karena proses ikut mati saat koneksi SSH putus, dan tidak ada
apa pun yang mencegah rilis cacat itu diaktifkan.

Kejadian kedua di hari yang sama: saya menambah nilai enum ke skema, hanya
menjalankan `prisma validate`, dan baru tahu delapan `Record<Enum, …>` pecah
saat build di server.

Rencana:

- Workflow GitHub Actions: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`,
  `pnpm build` pada setiap push.
- Job kedua yang menjalankan `prisma migrate deploy` ke database sekali pakai
  lalu `prisma migrate diff` — riwayat migrasi harus bisa diputar dari kosong.
- Deploy hanya boleh jalan kalau semuanya hijau.

Acceptance criteria:

- Push dengan test gagal tidak bisa di-deploy.
- Skema yang tidak sinkron dengan kode ketahuan sebelum menyentuh server.
- `activate.sh` menolak rilis tanpa `.next/BUILD_ID` (sudah ada) **dan**
  pipeline memverifikasi build sebelum upload.

## Prioritas 2 — Webhook WhatsApp inbox tanpa verifikasi

**Bukti:** `app/api/inbox/whatsapp/webhook/route.ts:75-88`. Handler `POST`
hanya membaca `workspaceId` dari query string dan mengecek
`whatsappIsActive`. Tidak ada verifikasi signature sama sekali.

Artinya siapa pun yang tahu atau menebak sebuah `workspaceId` bisa menyuntikkan
pesan inbox palsu ke workspace mana pun. Kolomnya sudah tersedia —
`whatsappAppSecret` dan `whatsappWebhookSecret` ada di `IntegrationSetting`
tapi tidak dipakai di jalur POST.

Yang membuat ini jelas kelalaian, bukan keputusan desain: `verifyMidtransSignature`
di `lib/midtrans.ts` menunjukkan basis kode ini tahu cara melakukannya. Webhook
Midtrans terverifikasi, webhook shipping pakai `SHIPPING_WEBHOOK_SECRET`,
webhook form kini bertanda tangan HMAC. Hanya yang ini yang terbuka.

Rencana:

- Verifikasi `X-Hub-Signature-256` memakai `whatsappAppSecret` untuk WABA.
- Untuk gateway non-Meta, pakai `whatsappWebhookSecret` sebagai shared secret.
- Tolak dengan 403 dan catat percobaan gagal, seperti `PaymentWebhookEvent`.

Acceptance criteria:

- Payload tanpa signature valid ditolak 403.
- Unit test mencakup signature benar, salah, dan tidak ada.

## Prioritas 3 — Modul kritis-keamanan tanpa test

**Bukti:** modul `lib/` terbesar yang tidak disentuh test mana pun:

| Modul | Baris | Kenapa penting |
| --- | --- | --- |
| `lib/member-auth.ts` | 117 | Sesi pelanggan storefront |
| `lib/password-reset.ts` | 111 | Token reset password |
| `lib/public-url.ts` | 113 | Resolusi subdomain → workspace |
| `lib/saas-limits.ts` | 157 | Gating fitur berbayar |
| `lib/smtp-email.ts` | 313 | Pengiriman email |

`lib/public-url.ts` yang paling mengkhawatirkan: ia memetakan host ke
workspace, jadi bug di sana adalah bug **isolasi tenant** — satu toko bisa
melayani konten toko lain. Fungsinya murni dan mudah diuji; tidak ada alasan
ia tidak tertutup.

Acceptance criteria:

- `normalizeHost`, `getPublicWorkspaceSlugFromHost`, `isWorkspaceSlug`
  tertutup test, termasuk host aneh: port, IPv6, trailing dot, huruf besar,
  subdomain bersarang.
- `planHasFeature` dan setiap `limitForKind` tertutup.

## Prioritas 4 — Query tanpa batas di dashboard

**Bukti:** `findMany` tanpa `take`, per file:

```
app/dashboard/analytics/page.tsx    6
app/dashboard/settings/page.tsx     4
app/dashboard/coupons/page.tsx      4
lib/actions/order.ts                2
lib/actions/cart.ts                 2
```
(masih ada ~10 file lain dengan 2 masing-masing)

Hari ini tidak terasa — produksi baru punya 5 order dan 12 workspace. Tapi
halaman analitik yang menarik seluruh tabel akan berhenti bisa dibuka jauh
sebelum databasenya besar, dan gejalanya akan muncul sebagai "dashboard lambat"
yang sulit dilacak.

Rencana:

- Beri `take` pada setiap `findMany` yang memberi makan tampilan.
- Untuk agregat, pindahkan ke `groupBy`/`count` alih-alih menarik baris lalu
  menghitung di JavaScript.

## Prioritas 5 — Tidak ada error monitoring

**Bukti:** tidak ada Sentry/OpenTelemetry. 25 `console.error` di `lib/` yang
semuanya berakhir di log PM2 dan tidak pernah dibaca siapa pun.

Beberapa di antaranya menelan kegagalan secara sengaja — `recordFormView`,
`recordConversionEvent`, `recordPageView` semuanya menangkap dan melanjutkan,
yang benar untuk analitik. Tapi artinya kalau analitik berhenti bekerja,
**tidak ada yang tahu**. Sama untuk `[form-export] stream failed` dan
`[payments] failed to reconcile`.

Rencana:

- Pasang Sentry (atau serupa) dan kirimkan `console.error` di `lib/` ke sana.
- Halaman `/dashboard/system/jobs` sudah jadi pondasi yang bagus; perluas ke
  ringkasan kegagalan lintas subsistem.

## Prioritas 6 — Dua tree masih hidup

**Bukti:** `.deploy-staging/` masih ada, 19 file eksklusif.

Keputusan menjadikan direktori utama sumber deploy sudah diambil dan
dieksekusi. Tapi `.deploy-staging/` masih di disk, dan hari ini terbukti
berbahaya: saya mengklasifikasikan konfigurasi **Midtrans per-workspace**
sebagai duplikat dan membuangnya. Padahal itu fitur nyata — tanpa ia, 12
workspace produksi akan berbagi satu akun merchant. Baru ketahuan karena Anda
menyebutnya.

Risiko yang sama masih tersisa untuk 18 file lain yang saya lewati dengan
alasan serupa.

Rencana:

- Telusuri satu per satu 18 file sisa, bandingkan **perilaku**, bukan nama
  file.
- Setelah yakin, arsipkan `.deploy-staging/` ke luar repo (zip) dan hapus dari
  working tree, supaya tidak ada yang salah menjalankannya lagi.

Yang sudah dipastikan **bukan** duplikat dan sudah diport: Midtrans
per-workspace, input kupon di checkout, toggle kupon, pemilih varian yang
menukar foto, form notifikasi penjualan.

## Prioritas 7 — Produksi tertinggal dari lokal

Produksi menjalankan rilis `20260912_merge_main_lineage`, yang **tidak** memuat
lima perbaikan hari ini: Midtrans per-workspace, kupon di checkout, toggle
kupon, varian menukar foto, dan pemindahan form notifikasi penjualan ke
Settings.

Khusus Midtrans, ini berarti produksi saat ini secara efektif **tidak punya
konfigurasi pembayaran per toko**.

## Prioritas 8 — Drift skema yang dibiarkan

**Bukti:** `prisma migrate diff` terhadap produksi maupun DB lokal masih
menyisakan 14 statement: tabel `WhatsAppWebhookEvent` yatim dan 8 kolom
`IntegrationSetting` yang tidak dideklarasikan skema mana pun. Semuanya kosong.

Dibiarkan dengan sengaja hari ini karena menghapus di database hidup tidak
memberi manfaat. Tapi selama drift ini ada, setiap `migrate diff` akan berisik,
dan suatu saat seseorang akan menjalankan DROP-nya tanpa berpikir.

Rencana:

- Deklarasikan objek-objek itu di skema (seperti yang sudah dilakukan untuk
  model `Refund`), atau
- Hapus lewat migrasi eksplisit setelah dipastikan nol baris di produksi.

Pilih satu. Yang penting `migrate diff` kembali bersih.

## Prioritas 9 — File raksasa

| File | Baris |
| --- | --- |
| `components/builder/settings-panel.tsx` | 4.792 |
| `lib/blocks/templates.ts` | 2.111 |
| `lib/blocks/schema.ts` | 1.539 |
| `lib/actions/order.ts` | 1.061 |
| `components/ecommerce/ecommerce-settings-form.tsx` | 1.049 |

`settings-panel.tsx` hampir 5.000 baris dalam satu komponen client. Itu dikirim
utuh ke browser setiap kali builder dibuka, dan praktis tidak bisa ditinjau
dalam satu pull request.

Bukan darurat, tapi tiap fitur baru di builder akan menambah biayanya.

## Prioritas 10 — E2E belum benar-benar terbukti

`e2e/checkout-to-refund.spec.ts` ada dan pernah lulus sampai tahap refund, tapi
**tidak pernah saya konfirmasi hijau ujung ke ujung**. Playwright juga terkunci
di 1.49 karena mesin ini macOS 12; di CI Linux versi terbaru bisa dipakai.

Release checklist di `DEPLOYMENT.md` menyebut `pnpm test:e2e` sebagai syarat
rilis. Selama belum terbukti hijau, baris itu menyesatkan.

---

## Catatan lingkungan (bukan kode)

**Disk mesin lokal 99% penuh** — 5,1 GB tersisa dari 466 GB. Dev server sudah
melempar `ENOSPC: no space left on device`. Ketika Next.js tidak bisa menulis
`.next`, ia bisa menyajikan hasil kompilasi basi; ini kemungkinan besar ikut
menyumbang kebingungan "versi lama" hari ini.

Empat salinan proyek di `~/Downloads` memakan ~6,9 GB (cache `.next` 2,3 GB,
`node_modules` 2,4 GB). Membuang `.next` di tiga salinan yang tidak dipakai
membebaskan ~1,4 GB dengan aman.

**Password root VPS terekspos di percakapan.** `DEPLOYMENT.md` §0 sendiri
menulis untuk merotasi kredensial yang bocor. Sebaiknya rotasi dan beralih ke
kunci SSH.

---

## Urutan kerja disarankan

1. **CI.** Selama belum ada, setiap prioritas lain bisa mundur diam-diam.
2. **Webhook WhatsApp.** Satu-satunya lubang keamanan yang terbuka ke publik.
3. **Deploy lima perbaikan hari ini.** Produksi sedang tanpa Midtrans per-toko.
4. **Test untuk `public-url` dan `member-auth`.** Isolasi tenant dan sesi.
5. **Error monitoring.**
6. **Query tanpa batas.**
7. **Selesaikan urusan dua tree.**
8. Sisanya sesuai kesempatan.

Nomor 1 lebih dulu karena dua insiden hari ini — produksi 502 dan enum yang
pecah — keduanya akan tertangkap CI sebelum menyentuh server.

---

## Status tindak lanjut — 13 Sep 2026

| # | Temuan | Status |
| --- | --- | --- |
| 1 | Tidak ada CI | **Selesai.** `.github/workflows/ci.yml` (replay migrasi, drift, tsc, lint, test, build) dan `scripts/verify-release.sh`. Belum jalan di GitHub karena repo belum tersambung. |
| 2 | Webhook WhatsApp tanpa verifikasi | **Selesai.** `lib/whatsapp/webhook-auth.ts`: HMAC `X-Hub-Signature-256` (WABA) atau shared secret (gateway), fail-closed, 403. 14 test. |
| 3 | Modul keamanan tanpa test | **Selesai.** Test untuk `public-url`, `member-auth`, `password-reset`, `saas-limits`. `NEXTAUTH_SECRET` wajib di produksi. |
| — | Secret terkirim ke browser | **Selesai.** Form Settings/Integrasi hanya menerima petunjuk `••••1234`; kosong = pertahankan, hapus harus eksplisit. Diverifikasi: 12 secret dummy tidak muncul di HTML. |
| 4 | Query tanpa batas | **Selesai.** Analitik/ringkasan pakai agregat SQL (`lib/analytics-aggregates.ts`). Paginasi di Produk, Blog, Kursus, Form, Halaman, Member (filter pindah ke server), Afiliasi, admin Users/Workspaces/Subscriptions/Reports, dan blog publik. Picker kupon dibatasi 500 + target yang sudah dipakai. |
| 5 | Tidak ada error monitoring | **Selesai (self-hosted).** `lib/error-reporting.ts` → tabel `ErrorEvent` (dedup per fingerprint, redaksi secret), error boundary klien → `/api/errors`, job yang gagal permanen, halaman `/admin/errors`. |
| 6 | Dua tree masih hidup | **Selesai.** 20 file staging ditelusuri per perilaku. Diport: pengiriman WhatsApp pesan operator (sebelumnya tidak pernah terkirim), Laporan Pajak, clear notifikasi. Tidak diport: `rajaongkir-config.ts` (API key hardcoded). Diarsip ke `~/Downloads/buildery-deploy-staging-archive-2026-09-13.zip`, lalu dihapus. |
| 7 | Produksi tertinggal | **Selesai** dengan rilis `20260913_hardening`. |
| 8 | Drift skema | **Selesai.** Objek lama dideklarasikan, bukan di-DROP. Drift lokal, replay, dan produksi = 0. |
| 9 | File raksasa | Belum. `settings-panel.tsx` masih ~4.800 baris. |
| 10 | E2E belum terbukti | **Selesai.** `pnpm test:e2e` 6/6 hijau terhadap build produksi lokal. Satu race ditemukan dan diperbaiki (`getOrCreateDefaultWebsite`). |

Masih di tangan pemilik proyek: menyambungkan repo git (menentukan nasib
`github.com/Momenikah/buildery`), merotasi password root VPS, dan merotasi API
key RajaOngkir yang pernah hardcoded di staging.
