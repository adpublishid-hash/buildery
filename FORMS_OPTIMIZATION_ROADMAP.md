# Forms Optimization Roadmap

Dokumen ini memetakan pembenahan lanjutan untuk modul Form (form builder,
submission publik, delivery, dan dashboard submission). Semua temuan di bawah
diverifikasi langsung terhadap kode di direktori ini pada 12 Sep 2026 —
bukan daftar praktik umum.

**Status: ketujuh prioritas sudah diimplementasikan (12 Sep 2026).**

| | Sebelum | Sesudah |
| --- | --- | --- |
| Test suite | 39 file, 256 test | 45 file, 334 test |
| `test/forms.test.ts` | 21 test | 29 test |
| Migrasi Prisma | 64 | 67 |

`pnpm test`, `pnpm lint`, `pnpm build`, dan `prisma migrate status` semuanya
hijau setelah perubahan ini.

Rincian per prioritas ada di bawah, di bagian **Hasil** masing-masing.

Model terkait: `Form`, `FormField`, `FormSubmission`, `FormDelivery`,
`AnalyticsEvent`.

## Fase 2 - publication lifecycle dan response controls

**Status: selesai diimplementasikan (18 Sep 2026).**

- Form baru dimulai sebagai `DRAFT` dan harus dipublikasikan secara eksplisit.
- Setiap publish membuat snapshot `FormVersion` yang immutable. Perubahan draft
  tidak bocor ke halaman publik, dan versi lama dapat direstore sebagai versi
  baru tanpa mengubah histori.
- Lifecycle sekarang membedakan `DRAFT`, `PUBLISHED`, dan `CLOSED`, lengkap
  dengan aksi publish, close, reopen, badge status, serta indikator perubahan
  yang belum dipublikasikan.
- Response controls mencakup jadwal buka/tutup, batas jumlah submission, dan
  pesan tutup khusus. Batas submission ditegakkan dalam transaksi dengan
  advisory lock agar dua request bersamaan tidak melewati kuota.
- Halaman publik, embedded form, validasi server, delivery/retry, redirect, dan
  event iklan memakai snapshot versi yang sama. Submission menyimpan
  `formVersionId` agar histori tetap dapat diaudit.
- Upload yang sudah tersimpan dibersihkan ketika submission atau form dihapus,
  serta di-rollback jika penyimpanan database gagal.
- UX submission mempertahankan pesan sukses meskipun response terakhir mengisi
  kuota; status tutup terlihat pada kunjungan atau reload berikutnya.

Migrasi: `20260917190000_form_publication_lifecycle`. Verifikasi akhir: Prisma
schema valid dan 95 migrasi up to date; TypeScript, production build, dan lint
lulus; 95 file / 800 unit-integration test lulus; E2E lifecycle form lulus.
Lint masih melaporkan dua warning lama di modul billing dan Meta tracker yang
tidak terkait perubahan form.

## Yang sudah kuat, jangan diutak-atik tanpa alasan

Supaya pembenahan tidak merusak yang sudah benar:

- **Upload file submission sudah rapat.** `lib/form-upload.ts` mendeteksi tipe
  lewat magic byte (bukan percaya `file.type` dari browser), menyimpan di
  `storage/form-submissions` di luar `public/`, dan `resolvePrivateFormUpload()`
  menolak path traversal. Route penyajiannya
  (`app/api/forms/submissions/[submissionId]/files/[field]/route.ts`)
  memeriksa membership workspace, memaksa `Content-Disposition: attachment`,
  `X-Content-Type-Options: nosniff`, dan `Cache-Control: private, no-store`.
- **Anti-bot dasar sudah ada.** Honeypot `_ml_company` dan time-trap `_ml_t`
  (<1.5 detik) di `submitFormAction`, plus rate limit `form-submit:${formId}`
  6 per menit per IP.
- **Index sudah sesuai pola query.** `FormSubmission` punya
  `@@index([formId, status, createdAt])` dan `@@index([workspaceId, createdAt])`.

---

## Prioritas 1 — Satukan logika visibility rule

Tujuan: menghapus implementasi ganda yang bisa menyimpang, dan menutup celah
test pada salinan yang justru menentukan keamanan.

Masalah yang ditemukan:

`lib/forms.ts` dan `lib/forms-shared.ts` memuat **dua implementasi terpisah dari
logika yang sama persis** — parsing rule dan evaluasi sepuluh operator
(`eq`, `neq`, `in`, `nin`, `contains`, `not_contains`, `filled`, `empty`,
`checked`, `unchecked`), masing-masing sekitar 120 baris yang nyaris identik
kata per kata:

| Modul | Fungsi | Dipakai oleh |
| --- | --- | --- |
| `lib/forms.ts` (`server-only`) | `parseVisibleIf`, `isFieldVisible` | `submitFormAction`, halaman form publik, halaman edit |
| `lib/forms-shared.ts` (client-safe) | `parseVisibleIfRule`, `evaluateVisible` | `public-form.tsx`, `field-editor.tsx` |

Pemisahannya sendiri masuk akal — komponen client tidak boleh mengimpor modul
`server-only`. Yang tidak masuk akal adalah menduplikasi isinya.

Lebih serius: **12 test visibility di `test/forms.test.ts` seluruhnya menguji
salinan client** (`evaluateVisible`/`parseVisibleIfRule` dari `forms-shared`).
Salinan server — yang di `submitFormAction` memutuskan apakah validasi sebuah
field ditegakkan atau dilewati — **tidak diuji sama sekali**. Kalau kedua
salinan menyimpang, field wajib bisa lolos tanpa validasi di server sementara
di browser tetap terlihat wajib.

Area terkait:

- `lib/forms.ts`
- `lib/forms-shared.ts`
- `lib/actions/form-submission.ts`
- `app/site/[workspaceSlug]/forms/[formSlug]/page.tsx`
- `app/dashboard/forms/[formId]/edit/page.tsx`
- `test/forms.test.ts`

Rencana:

- Jadikan `lib/forms-shared.ts` satu-satunya implementasi.
- Di `lib/forms.ts`, ganti `parseVisibleIf`/`isFieldVisible` menjadi re-export
  beralias dari `forms-shared` supaya pemanggil yang ada tidak perlu diubah,
  atau ubah pemanggil untuk mengimpor langsung dari `forms-shared`.
- Hapus `evaluateRule` dan `parseVisibleIfRule` versi `forms.ts`.
- Samakan juga nama tipe: `VisibleIf` (forms.ts) vs `VisibleIfRule`
  (forms-shared) adalah tipe yang sama dengan dua nama.
- Tambahkan test yang mengimpor lewat jalur server sehingga kedua entry point
  tercakup.

Acceptance criteria:

- Hanya ada satu `evaluateRule` di seluruh repo.
- `test/forms.test.ts` mengeksekusi jalur server maupun client.
- Perilaku kesepuluh operator tidak berubah — test lama tetap lulus tanpa diedit.

**Hasil.** `lib/forms.ts` turun dari 176 ke 73 baris: `parseVisibleIf` dan
`isFieldVisible` kini re-export beralias dari `lib/forms-shared.ts`, dan
salinan keduanya di `forms.ts` dihapus bersama tipe `VisibleIf` yang ternyata
tidak dipakai siapa pun. Empat test baru di `test/forms.test.ts` menjalankan
kesepuluh operator lewat jalur server; salah satunya menegaskan
`parseVisibleIf === parseVisibleIfRule` sebagai identitas fungsi — itulah yang
membuat salinan kedua tidak bisa muncul lagi tanpa test gagal.

## Prioritas 2 — Delivery lewat job queue, dengan retry otomatis

Tujuan: notifikasi submission tidak hilang saat proses restart, dan kegagalan
sementara pulih sendiri tanpa operator menekan tombol.

Masalah yang ditemukan:

`dispatchSubmissionDeliveries` dipanggil sebagai fire-and-forget di
`lib/actions/form-submission.ts`:

```ts
void dispatchSubmissionDeliveries(submission, form.workspace.name).catch(...)
```

Komentarnya benar bahwa visitor tidak diblokir. Tapi konsekuensinya:

- Kalau proses PM2 restart atau di-reload tepat setelah respons terkirim,
  email/webhook/Telegram untuk submission itu **hilang permanen** — baris
  `FormDelivery` tertinggal `PENDING` selamanya dan tidak ada yang menyapunya.
- **Tidak ada retry otomatis sama sekali.** `retrySubmissionDeliveries` hanya
  dipanggil dari satu action dashboard (`lib/actions/form-submission.ts:644`).
  Webhook penerima yang down lima menit berarti lead-nya harus diselamatkan
  manual, satu per satu.
- `lib/jobs/` tidak punya handler form apa pun — bandingkan dengan
  `STORE_NOTIFICATION_RETRY` yang sudah ada untuk notifikasi toko.

`FormDelivery` juga belum punya kolom untuk backoff: yang ada hanya `attempts`,
`lastError`, `lastTriedAt` — tidak ada `nextAttemptAt` atau `maxAttempts`.

Area terkait:

- `lib/form-delivery.ts`
- `lib/actions/form-submission.ts`
- `lib/jobs/handlers/index.ts`
- `lib/jobs/runner.ts` (`RECURRING_JOBS`)
- `lib/jobs/types.ts`
- `prisma/schema.prisma` (`FormDelivery`, enum `ScheduledJobKind`)

Rencana:

- Tambahkan `nextAttemptAt DateTime?` dan `maxAttempts Int @default(5)` ke
  `FormDelivery`, plus index `@@index([status, nextAttemptAt])`.
- Tambahkan `FORM_DELIVERY_RETRY` ke enum `ScheduledJobKind` dan daftarkan di
  `RECURRING_JOBS` (interval 5 menit, meniru `STORE_NOTIFICATION_RETRY`).
- Buat `lib/form-delivery-retry.ts` dengan `retryPendingFormDeliveries()` yang
  menyapu baris `PENDING` yang tertinggal **dan** `FAILED` yang sudah jatuh
  tempo, dengan backoff eksponensial.
- Pertahankan pengiriman inline sebagai jalur cepat (lead panas tetap masuk
  dalam hitungan detik); job hanya jaring pengaman.
- Sesudah `maxAttempts` habis, baris berhenti dicoba dan tetap terlihat di
  dashboard sebagai gagal permanen.

Acceptance criteria:

- Submission yang delivery-nya tertinggal `PENDING` karena restart terkirim
  pada tick berikutnya.
- Webhook yang sempat down pulih sendiri tanpa intervensi.
- Percobaan tidak berjalan selamanya — ada batas yang terlihat jelas.
- Tombol retry manual tetap berfungsi seperti sekarang.
- Job baru muncul di `/dashboard/system/jobs` seperti sweep lain.

**Hasil.** `FormDelivery` dapat `nextAttemptAt` dan `maxAttempts`
(migrasi `20260912120000_form_delivery_retry`), plus job `FORM_DELIVERY_RETRY`
tiap 5 menit. `lib/form-delivery.ts` dipecah: `performDelivery()` hanya
mengirim dan mengembalikan hasil, `recordDeliveryOutcome()` yang menulis baris
dan menjadwalkan percobaan berikutnya — sehingga pengiriman inline dan sweep
memakai kode yang sama. `lib/form-delivery-retry.ts` menyapu baris `FAILED`
yang jatuh tempo **dan** baris `PENDING` yang lebih tua dari 5 menit (itulah
yang menyelamatkan lead saat proses mati di tengah kirim), dengan klaim
bersyarat supaya dua worker tidak bisa sama-sama menang. Retry manual tetap
ada dan sengaja tidak menghabiskan jatah percobaan otomatis.
11 test di `test/form-delivery-retry.test.ts`.

## Prioritas 3 — Pencarian submission yang benar-benar mencari

Tujuan: kotak pencarian di halaman submission menemukan submission berdasarkan
isinya, dan angka paginasinya jujur.

Masalah yang ditemukan:

Di `app/dashboard/forms/[formId]/submissions/page.tsx`, pencarian `q` dikerjakan
dua kali dengan cara yang saling bertabrakan:

1. Query DB memfilter `WHERE` hanya pada `notes`, `ipAddress`, dan `userAgent`.
2. Hasil **halaman itu saja** lalu difilter ulang di JavaScript, kali ini
   termasuk isi `data` tiap field.

Akibatnya, mencari alamat email pengirim mengembalikan **nol baris** — karena
langkah 1 sudah membuang semua submission yang emailnya tidak kebetulan muncul
di `notes`/`ipAddress`/`userAgent`, sebelum langkah 2 sempat melihat `data`.
Komentar di kode mengakui ini ("best-effort over the current page"), tetapi dari
sisi pengguna kotak pencarian itu tampak rusak, bukan terbatas.

Paginasinya juga tidak konsisten: `totalPages` dihitung dari `totalMatching`
(hitungan DB, baris 151), sedangkan yang dirender adalah `filtered` (subset
hasil filter JS). Saat `q` diisi, footer bisa mengatakan "menampilkan 50 dari
120" padahal di layar hanya ada 3 baris, dan halaman berikutnya bisa kosong.

Area terkait:

- `app/dashboard/forms/[formId]/submissions/page.tsx`
- `prisma/schema.prisma` (`FormSubmission.data`)
- `lib/forms.ts` (`readSubmissionCell`)

Rencana:

- Pindahkan pencarian isi ke database. `FormSubmission.data` adalah kolom JSON;
  cari dengan Postgres langsung lewat `prisma.$queryRaw`, misalnya
  `data::text ILIKE '%q%'` sebagai langkah pertama yang sederhana.
- Kalau volume sudah besar, tambahkan kolom terurai (`searchText`) yang diisi
  saat submission dibuat, plus index GIN `pg_trgm` — lebih murah daripada
  memindai JSON tiap query.
- Hapus filter JS kedua sepenuhnya, sehingga `totalMatching` dan baris yang
  dirender berasal dari query yang sama.
- Pertahankan pencarian pada `notes`/`ipAddress`/`userAgent` sebagai bagian dari
  `OR` yang sama.

Acceptance criteria:

- Mencari alamat email atau isi field lain menemukan submission-nya, di halaman
  mana pun ia berada.
- Jumlah di footer paginasi sama dengan jumlah baris yang benar-benar tampil.
- Halaman berikutnya tidak pernah kosong selama `page <= totalPages`.
- Filter status dan pencarian bisa dipakai bersamaan.

**Hasil.** `lib/form-submission-query.ts` menjadi satu-satunya sumber
predikat — dipakai halaman submission maupun route export. Pencarian pindah ke
SQL (`data::text ILIKE …`) sehingga isi submission benar-benar tercari, dan
filter JS tahap kedua dihapus, jadi `totalMatching` dan baris yang tampil
berasal dari query yang sama.

Satu jebakan yang hanya ketahuan karena diuji ke database sungguhan: di dalam
template literal TypeScript, `\'` diurai menjadi `'`, sehingga `ESCAPE '\'`
yang saya tulis mula-mula sampai ke Postgres sebagai `ESCAPE ''` — tanpa
escape character sama sekali. Akibatnya pencarian "50%" justru tidak menemukan
apa pun. Perlu `ESCAPE '\\'` di source. Diverifikasi terhadap Postgres lokal:
cari email di dalam `data` ketemu, `%` dan `_` diperlakukan literal, filter
status dan `q` jalan bersamaan.

## Prioritas 4 — Hardening webhook: SSRF guard dan signature

Tujuan: URL webhook yang diisi penulis form tidak bisa dipakai memindai jaringan
internal server, dan penerima bisa memverifikasi bahwa payload benar dari sini.

Masalah yang ditemukan:

`webhookUrl` divalidasi di `lib/zod.ts` hanya dengan
`/^https?:\/\//i` (`optionalHttpUrl`, baris 419-427). Tidak ada penyaringan
host. `deliverWebhook` lalu mem-`fetch` URL itu dari server.

Artinya pengguna dengan peran `content.edit` (OWNER/ADMIN/**EDITOR**) bisa
mengarahkan webhook ke `http://169.254.169.254/latest/meta-data/`,
`http://127.0.0.1:5433`, atau host mana pun di jaringan privat VPS. Isi respons
memang tidak dikembalikan, tetapi **status code-nya bocor** ke `lastError`
(`HTTP ${res.status}`) yang tampil di dashboard — cukup untuk memetakan port dan
host internal. Ini blind SSRF dengan oracle status.

Terpisah dari itu: payload webhook dikirim tanpa signature apa pun, jadi
penerima tidak punya cara membedakan kiriman asli dari siapa pun yang menebak
URL endpoint-nya.

Area terkait:

- `lib/form-delivery.ts` (`deliverWebhook`)
- `lib/zod.ts` (`optionalHttpUrl`, `formSchema`)
- `lib/actions/form.ts`
- `.env.example`

Rencana:

- Buat helper `assertPublicHttpUrl()`: tolak skema non-http(s), tolak
  `localhost`, dan tolak rentang IP privat/loopback/link-local
  (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`).
- Resolusi DNS harus dicek **saat request**, bukan hanya saat simpan — nama host
  publik bisa diarahkan ulang ke IP internal setelah validasi (DNS rebinding).
- Jangan ikuti redirect (`redirect: "manual"`), supaya 302 ke alamat internal
  tidak lolos.
- Ganti `lastError` untuk kegagalan jaringan menjadi pesan generik; jangan
  tampilkan status code host yang ditolak.
- Tambahkan header `X-Buildery-Signature` berisi HMAC-SHA256 dari body memakai
  secret per-workspace, plus `X-Buildery-Timestamp` untuk mencegah replay.
- Dokumentasikan cara memverifikasi signature di sisi penerima.

Acceptance criteria:

- Webhook ke alamat loopback/privat ditolak saat disimpan **dan** saat dikirim.
- Redirect ke alamat internal tidak diikuti.
- Pesan error di dashboard tidak membocorkan status host internal.
- Payload membawa signature yang bisa diverifikasi penerima.
- Unit test mencakup host publik (lolos), host privat, `localhost`, redirect ke
  internal, dan pembentukan signature.

**Hasil.** `lib/outbound-url.ts` (baru) menolak skema non-http(s), kredensial
di URL, nama host lokal/metadata, serta seluruh rentang privat, loopback,
link-local, CGNAT, dan multicast untuk IPv4 maupun IPv6 — termasuk bentuk
IPv4-mapped `::ffff:10.0.0.1`. Pemeriksaan berjalan **dua kali**: saat form
disimpan (`lib/actions/form.ts`, sintaks saja) dan tepat sebelum request
dikirim (resolusi DNS penuh), yang menutup DNS rebinding. Redirect tidak
diikuti (`redirect: "manual"`) dan dilaporkan sebagai kegagalan, bukan
diam-diam dituruti.

Payload kini membawa `X-Buildery-Timestamp` dan `X-Buildery-Signature`
(HMAC-SHA256 atas `timestamp.body`, kunci diturunkan per workspace sehingga
secret satu tenant tidak bisa memalsukan kiriman tenant lain). Cara
memverifikasinya didokumentasikan di `FORM_WEBHOOKS.md`.
28 test di `test/outbound-url.test.ts` dan `test/form-webhook.test.ts`.

## Prioritas 5 — Export CSV yang tidak memuat semuanya ke memori

Tujuan: export tidak menjatuhkan proses saat sebuah form punya banyak
submission, dan hasilnya sesuai dengan yang sedang dilihat operator.

Masalah yang ditemukan:

`app/api/forms/[formId]/export/route.ts` berkomentar "Streams a CSV" tetapi
tidak melakukan streaming sama sekali:

```ts
submissions: { orderBy: { createdAt: "asc" } },   // tanpa take
...
const csv = submissionsToCsv(form.fields, form.submissions);
const body = `${csv}`;   // template literal diawali karakter BOM literal
```

Seluruh baris ditarik ke memori, lalu seluruh CSV dirakit sebagai satu string,
lalu disalin lagi saat BOM ditambahkan. Untuk form dengan puluhan ribu
submission ini adalah beberapa kali lipat ukuran data di heap sekaligus.

Selain itu export **mengabaikan filter yang sedang aktif**. Operator yang sedang
melihat submission berstatus `NEW` hasil pencarian tertentu menekan "Export" dan
mendapat seluruh isi form, termasuk yang sudah diarsipkan dan ditandai spam.

Area terkait:

- `app/api/forms/[formId]/export/route.ts`
- `lib/forms.ts` (`submissionsToCsv`, `readSubmissionCell`)
- `app/dashboard/forms/[formId]/submissions/page.tsx` (tombol export)

Rencana:

- Ubah menjadi streaming sungguhan dengan `ReadableStream`: kirim baris header
  lebih dulu, lalu ambil submission per batch (`take` + `cursor`) dan dorong
  tiap baris ke stream.
- Pecah `submissionsToCsv` menjadi `csvHeaderRow(fields)` dan
  `csvRow(fields, submission)` supaya bisa dipakai per baris; pertahankan
  `submissionsToCsv` sebagai pembungkus agar test yang ada tetap jalan.
- Teruskan `status` dan `q` dari query string ke route export, memakai fungsi
  `where` yang sama dengan halaman submission.
- Beri nama file yang mencerminkan filter, misalnya
  `kontak-submissions-new.csv`.

Acceptance criteria:

- Export form besar berjalan dengan penggunaan memori yang rata, bukan melonjak.
- Isi export sama persis dengan yang tersaring di layar.
- BOM UTF-8 tetap ada supaya Excel membuka karakter non-ASCII dengan benar.
- Pemeriksaan permission `content.view` tidak berubah.

**Hasil.** Route export kini streaming sungguhan, dan menghormati
backpressure: header dikirim di `start()`, lalu tiap panggilan `pull()`
mengambil **satu** batch 500 id lewat `iterateSubmissionIds()`. Menaruh
seluruh loop di `start()` — percobaan pertama saya — tetap akan mengantre
semua chunk di queue internal stream dan setengah membatalkan tujuannya;
dengan `pull()`, klien yang lambat justru merem query-nya. `cancel()`
menghentikan paging saat klien memutus koneksi. `submissionsToCsv` dipecah menjadi `csvHeaderRow()` dan
`csvRow()` — pembungkus lamanya dipertahankan, dan sebuah test menegaskan
gabungan kedua fungsi baru identik dengan keluarannya. Route juga membaca
`status` dan `q` dari query string memakai predikat yang sama dengan halaman,
dan tombol export meneruskan filter yang sedang aktif (labelnya berubah jadi
"Export hasil filter" kalau ada filter). BOM UTF-8 tetap di depan header.

## Prioritas 6 — Anti-duplikat submission

Tujuan: satu kali isi form menghasilkan satu submission, bukan dua atau tiga.

Masalah yang ditemukan:

`FormSubmission` tidak punya kunci idempotensi apa pun. Bandingkan dengan
checkout, yang sudah memakai `Order.checkoutRequestId @unique` justru untuk
masalah ini.

Komponen `public-form.tsx` memang men-disable tombol lewat `pending`, tapi itu
hanya menutup klik ganda dalam satu tab. Yang tidak tertutup: visitor menekan
"reload" pada halaman hasil POST, koneksi seluler yang mengirim ulang request,
atau retry di level jaringan. Tiap duplikat juga memicu satu set
`FormDelivery` lagi — jadi penerima mendapat dua email untuk satu lead.

Area terkait:

- `prisma/schema.prisma` (`FormSubmission`)
- `lib/actions/form-submission.ts` (`submitFormAction`)
- `components/forms/public-form.tsx`

Rencana:

- Tambahkan `requestId String? @unique` pada `FormSubmission`.
- Di `public-form.tsx`, buat satu `crypto.randomUUID()` per sesi pengisian
  (simpan di `useRef` seperti `checkoutRequestId.current` di `checkout-form.tsx`)
  dan kirim di field tersembunyi.
- Di `submitFormAction`, kalau `requestId` sudah ada, kembalikan hasil sukses
  yang sama tanpa membuat baris atau delivery baru.
- Regenerasi `requestId` setelah submit sukses supaya pengisian berikutnya di
  tab yang sama tetap tercatat.

Acceptance criteria:

- Mengirim request yang sama dua kali menghasilkan satu `FormSubmission` dan
  satu set `FormDelivery`.
- Visitor tetap melihat pesan sukses pada percobaan kedua, bukan pesan error.
- Form tanpa `requestId` (embed lama, klien non-JS) tetap bisa submit.
- Unit test mencakup submit pertama, submit ulang identik, dan submit baru
  sesudahnya.

**Hasil.** `FormSubmission.requestId` unik (migrasi
`20260912130000_form_submission_request_id`). Klien mencetak satu kunci per
sesi pengisian dan meregenerasinya setelah "Submit another response".
Server memeriksa kunci **sebelum** rate limit — pengiriman ulang tidak
menghabiskan jatah orang yang tidak berbuat salah — dan menjawabnya dengan
`redirectUrl` yang sama seperti aslinya. Balapan yang lolos pemeriksaan itu
tertangkap oleh unique index dan diterjemahkan dari `P2002` menjadi sukses,
bukan error. Kunci berbentuk asing ditolak dan disimpan sebagai `null`, jadi
embed lama tanpa JS tetap bisa submit. Diverifikasi ke Postgres bahwa banyak
baris `requestId` null tetap diizinkan. 10 test.

## Prioritas 7 — Analitik konversi form

Tujuan: penulis form tahu berapa banyak orang yang melihat form dibanding yang
benar-benar mengirim.

Masalah yang ditemukan:

Tidak ada pencatatan tampilan form sama sekali — `lib/analytics.ts` tidak
menyentuh form. Dashboard hanya bisa menampilkan jumlah submission, jadi
pertanyaan paling dasar ("apakah form ini terlalu panjang?") tidak terjawab.
Untuk form multi-step, yang juga tidak diketahui adalah di langkah mana orang
berhenti, padahal `FormField.pageStep` sudah menyimpan struktur langkahnya.

Prioritas ini sengaja ditempatkan terakhir: ini penambahan kemampuan, bukan
perbaikan sesuatu yang rusak.

Area terkait:

- `lib/analytics.ts`
- `app/site/[workspaceSlug]/forms/[formSlug]/page.tsx`
- `components/forms/public-form.tsx`
- `app/dashboard/forms/page.tsx`
- `prisma/schema.prisma`

Rencana:

- Catat event `form_view` lewat jalur analitik yang sudah ada saat form publik
  dirender.
- Untuk form multi-step, catat langkah terjauh yang dicapai saat visitor
  meninggalkan halaman.
- Tampilkan view, submission, dan conversion rate per form di daftar form.
- Hormati pengaturan privasi/analitik workspace yang sudah berlaku; jangan
  menambah cookie baru.

Acceptance criteria:

- Daftar form menampilkan view, submission, dan conversion rate.
- Form multi-step menunjukkan sebaran langkah tempat orang berhenti.
- Pencatatan tidak memperlambat render form publik.

**Hasil.** `AnalyticsEventType` dapat nilai `FORM_VIEW`, dan `AnalyticsEvent`
dapat `formId` + `formStep` (migrasi `20260912140000_form_view_analytics`) —
menumpang tabel analitik yang ada alih-alih menambah tabel baru. Step 0 dicatat
saat form pertama dirender, step *n* saat visitor pertama kali mencapainya,
lewat beacon `POST /api/forms/[formId]/view`. Endpoint itu sengaja terpisah
dari `/api/track`: sebuah form view bukan page view (tidak boleh memicu Meta
PageView), dan workspace-nya diturunkan dari form, bukan diambil dari request,
supaya tidak bisa dipakai menulis event ke workspace sembarangan.

Daftar form menampilkan Views dan Conversion; halaman submission menambahkan
kartu Views/Conversion serta grafik "Langkah yang dicapai" untuk form
multi-step, lengkap dengan selisih orang yang berhenti di tiap langkah.
Conversion ditulis "—" selama belum ada yang melihat, bukan 0% yang
menyesatkan. 10 test.

---

## Urutan kerja disarankan

1. **Satukan logika visibility rule.** Paling murah, dan selama duplikasi masih
   ada, setiap perubahan aturan visibility harus ditulis dua kali dengan risiko
   salah satu tertinggal.
2. **Delivery lewat job queue.** Dampak bisnis terbesar: lead yang hilang tidak
   bisa dipulihkan belakangan.
3. **Pencarian submission.** Rusak dari sisi pengguna dan dipakai setiap hari.
4. **Hardening webhook.** Satu-satunya temuan dengan sisi keamanan; ditempatkan
   sesudah nomor 3 karena butuh peran editor untuk dieksploitasi, bukan akses
   anonim.
5. **Export CSV.** Baru menggigit pada volume besar.
6. **Anti-duplikat submission.** Mengganggu, tapi duplikatnya terlihat dan bisa
   dibereskan manual.
7. **Analitik konversi.** Fitur baru, bukan perbaikan.

Nomor 1 sebaiknya dikerjakan lebih dulu karena nomor 2 dan 6 sama-sama menyentuh
`lib/actions/form-submission.ts`; menyatukan logika visibility terlebih dahulu
membuat perubahan berikutnya bekerja di atas satu sumber kebenaran.

## Catatan deploy

Direktori ini **bukan** sumber deploy. `.deploy-staging/` yang dikirim ke
produksi, dan kedua tree sudah divergen dua arah. Sebelum merilis, cek dulu
seberapa jauh modul form berbeda:

```bash
diff -q lib/forms.ts .deploy-staging/lib/forms.ts
diff -q lib/actions/form-submission.ts .deploy-staging/lib/actions/form-submission.ts
diff -q lib/form-delivery.ts .deploy-staging/lib/form-delivery.ts
```

Per 12 Sep 2026: `lib/forms.ts` dan `lib/actions/form-submission.ts` **berbeda**
antara kedua tree, sedangkan `lib/form-delivery.ts` **identik**. Artinya
Prioritas 2 dan 4 bisa diport relatif bersih, sementara Prioritas 1, 3, dan 6
perlu dibandingkan baris per baris lebih dulu.

Prioritas 2, 4, dan 6 masing-masing membawa migrasi Prisma, jadi ikuti release
checklist di `DEPLOYMENT.md` — backup database sebelum `migrate deploy`.
