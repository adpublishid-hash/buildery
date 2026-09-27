# Content & Theme Optimization Roadmap

Status: implemented on 19 September 2026.

## Tema dan cakupannya

- [x] Warna, tipografi, sudut, jarak antar section, dan lebar konten kini diatur
      dari halaman Tema. Sebelumnya satu-satunya tempat mengubahnya adalah
      dialog di dalam builder satu halaman, lewat route yang di-scope ke
      halaman — sehingga mengganti warna saat menggarap satu landing page
      diam-diam merestyle semua halaman lain.
- [x] Halaman yang bernama "Tema" akhirnya memuat tema. Sebelumnya isinya hanya
      label menu header dan footer.
- [x] Dialog di builder tetap ada, tapi sekarang menyatakan cakupannya dan
      menautkan ke halaman Tema.
- [x] Pratinjau langsung di halaman Tema.
- [x] Perubahan tema tercatat di audit log workspace.

## Token desain

- [x] Ditambah `spacing` (jarak antar section) dan `containerWidth` (lebar
      konten), plus dua pilihan font baru.
- [x] Field baru wajib punya `.default()`. Baris lama hanya memuat enam field
      pertama; tanpa default, `safeParse` gagal dan seluruh tema yang sudah
      diatur pemilik situs hilang saat deploy. Ada uji regresi untuk ini.
- [x] Hanya tumpukan font yang sudah ada di perangkat. Memuat font dari
      jaringan menambah permintaan pemblokir render di halaman yang justru
      dijual karena kecepatannya. Ada uji yang menolak `http` dan `url()`.

## Gambar di halaman publik

- [x] Semua 21 blok memakai `BlockImage`, yang menunjuk `srcset` ke pengoptimal
      Next untuk berkas yang kita simpan sendiri. Sebelumnya 26 `<img>` mentah
      berbanding 1 `next/image`: foto 3 MB dari HP pelanggan dikirim apa adanya.
- [x] Sengaja tetap `<img>` dan bukan `next/image`: komponen itu membungkus
      gambarnya sendiri dan `fill` menuntut induk ber-`position`, jadi
      menukarnya di puluhan blok berarti mengubah tata letak yang sudah jadi.
      DOM-nya tetap sama persis; yang terkirim sudah diperkecil.
- [x] URL eksternal tidak dioptimasi. Pengguna boleh menempel alamat gambar
      mana pun, dan meneruskan alamat sembarang ke pengoptimal berarti server
      kita mengambil URL yang ditentukan orang lain.
- [x] Media hero ditandai `priority`. Konversi ke `loading="lazy"` sebenarnya
      akan **memperburuk** LCP untuk elemen di atas lipatan — hero dulu eager
      karena itu default browser.

## Pembersihan berkas

- [x] Pemeriksaan referensi kini mencakup `PageBlock`, `PageRevision`,
      `SavedSection`, dan `SiteTemplate`. Sebelumnya tidak satu pun: helper
      pembersih akan menghapus gambar yang masih dipakai landing page yang
      sedang tayang.
- [x] Pemindaian JSON yang gagal diperlakukan sebagai "masih dipakai". Menahan
      berkas yatim jauh lebih murah daripada menghapus gambar yang masih tayang.
- [x] Pembersihan disambungkan ke penghapusan produk, varian produk, dan kursus.
      Sebelumnya hanya blog yang memanggilnya; berkas lain menumpuk selamanya.

## Retensi revisi

- [x] Autosave dan checkpoint punya kuota terpisah: 20 autosave, 80 checkpoint
      (manual, terbit, dikembalikan). Sebelumnya satu kuota 100 untuk semua,
      dan autosave — yang jalan 1,8 detik setelah mengetik berhenti — menggusur
      habis versi manual serta versi terbit dari kemarin, justru versi yang
      ingin dikembalikan orang.

## Template situs

- [x] `SiteTemplate` akhirnya menyimpan kontennya sendiri: `blocks`,
      `blockCount`, `designTokens`, `category`, `sortOrder`, dan penulisnya.
      Sebelumnya modelnya hanya metadata, jadi apa pun yang dibuat admin di
      `/admin/templates` tidak pernah bisa muncul di mana pun.
- [x] Builder membaca daftar gabungan: template kustom yang dikurasi admin
      lebih dulu, lalu template bawaan kode.
- [x] Admin bisa membuat template dengan menyalin blok satu halaman yang sudah
      jadi, beserta tema situsnya — jauh lebih berguna daripada menyusun ulang
      block dari nol.
- [x] Blok template kustom divalidasi ulang saat dibaca; baris database bisa
      berasal dari versi skema yang lebih lama.
- [x] Template tanpa blok tidak bisa diterbitkan dan tidak muncul di builder.
      Migrasi menarik template lama yang terbit tanpa blok dari publikasi.
- [x] Halaman admin menandai template kosong alih-alih membiarkannya tampak
      normal.

## Pustaka media

- [x] Halaman `/dashboard/media`: telusuri, salin URL, dan hapus berkas, dengan
      total pemakaian penyimpanan. Sebelumnya tidak ada satu pun halaman untuk
      melihat apa yang sudah diunggah.
- [x] Tombol hapus memakai pemeriksaan referensi yang sama, jadi tidak bisa
      memutus gambar yang masih tayang.

## SEO

- [x] Structured data untuk halaman builder: `WebSite` di homepage, `WebPage`
      plus `BreadcrumbList` di halaman lain. Produk dan artikel blog sudah lama
      punya JSON-LD; halaman builder tidak punya sama sekali.
- [x] Halaman bertanda `noindex` dilewati — menandainya agar tidak diindeks
      lalu tetap menyodorkan structured data adalah pesan yang bertentangan.
- [x] Pratinjau tidak mendapat structured data.

## Bahasa

- [x] Dialog revisi, dialog tema, dan pesan galat builder dipindah ke bahasa
      Indonesia, termasuk label sumber revisi.

## Cakupan uji

- [x] Token lama tanpa field baru tetap terbaca utuh; warna pemilik situs tidak
      hilang.
- [x] Setiap font yang ditawarkan picker valid, dan tidak satu pun memuat dari
      jaringan.
- [x] Retensi revisi: autosave tidak pernah menggusur checkpoint, yang disimpan
      adalah autosave terbaru, dan riwayat pendek tidak disentuh.
- [x] Pembersihan menolak menghapus gambar yang dipakai blok halaman, revisi,
      atau section tersimpan, dan tetap menghapus yang benar-benar yatim.
- [x] Template kustom muncul di daftar builder, template kosong disembunyikan,
      dan id tak dikenal mengembalikan null.

## Catatan operasional

- Terapkan migrasi `20260919120000_site_template_content`. Idempoten dan sudah
  diuji dijalankan dua kali tanpa drift.
- Migrasi menarik dari publikasi setiap `SiteTemplate` yang terbit tanpa blok.
  Itu template yang selama ini memang tidak bisa muncul di mana pun; buat ulang
  dari sebuah halaman lewat tombol "Dari halaman" di `/admin/templates`.
- Perubahan tema kini berlaku ke **semua** situs milik workspace sekaligus.
  Hampir semua workspace hanya punya satu situs, tapi halaman Tema menyebutkan
  jumlahnya kalau lebih.

## Putaran lanjutan — 19 September 2026

Dua hal yang ditunda di putaran pertama, dikerjakan terpisah seperti yang
disarankan.

### Pemecahan settings-panel

- [x] `components/builder/settings-panel.tsx` turun dari 4.792 menjadi 774
      baris; 30 form per tipe block pindah ke modulnya sendiri di
      `components/builder/settings/`.
- [x] Setiap form dimuat lewat `next/dynamic`, jadi hanya form untuk tipe block
      yang benar-benar dipilih yang diunduh.
- [x] `StyleForm` dan `AnimationForm` tetap eager: keduanya berlaku untuk setiap
      block, jadi memuatnya lazy hanya menambah kedip tanpa menghemat apa pun.
- [x] Potongan yang dipakai bersama dipusatkan di `settings/shared.tsx`.
- [x] Uji yang mengunci hasilnya: dispatcher tetap di bawah 1.000 baris, tidak
      ada impor statis form, satu ekspor per modul, dan semua modul tetap
      client component.

**Hasil pengukurannya jujur: bundel awal tidak berkurang.** Baseline sebelum
perubahan 155 kB route / 355 kB First Load JS; sesudahnya 156 kB / 357 kB.
Form-nya memang benar-benar keluar dari chunk halaman — string khas
`ComparisonTableForm` tidak lagi ada di dalamnya, dan potongannya kini berdiri
sebagai chunk terpisah (~39 kB mentah). Tapi itu bukan bagian terberat: berat
utama ada di `BlockRenderer`, yang mengimpor 33 komponen blok secara eager
karena kanvas memang harus bisa menggambar block apa pun yang ada di halaman.
Sebagian kecil penghematannya juga terimbangi oleh kode mode gelap yang masuk
di putaran yang sama.

Jadi manfaat nyata pemecahan ini adalah keterbacaan dan pemuatan form sesuai
kebutuhan, **bukan** halaman builder yang lebih ringan. Itu persis risiko yang
disebut di putaran pertama, sekarang dengan angka di belakangnya. Kalau bundel
builder memang jadi target, langkah berikutnya adalah `BlockRenderer` — dan itu
punya tukar-tambahnya sendiri, karena memuat renderer secara lazy membuat block
berkedip saat diedit.

### Mode gelap halaman publik

- [x] Token baru: `colorScheme` (terang/gelap/ikut perangkat) plus warna latar,
      permukaan, dan teks versi gelap.
- [x] Situs yang sudah ada tetap terang. Menyalakan mode gelap tanpa diminta
      akan mengubah tampilan situs orang di depan pengunjungnya.
- [x] Diterapkan sebagai satu lapisan pemetaan bercakupan halaman publik, bukan
      penulisan ulang 33 blok. Blok menuliskan warnanya sebagai utility Tailwind
      tetap sebanyak ~770 kemunculan; menulis ulang semuanya adalah perubahan
      besar yang mudah merusak tampilan yang sudah jadi, dan tetap harus dijaga
      manual setiap ada blok baru.
- [x] Selektornya `[data-bd-scheme="dark"] .bg-white` (spesifisitas 0,2,0)
      menang atas `.bg-white` (0,1,0), jadi tidak perlu `!important`.
- [x] CSS-nya disuntik per halaman, bukan di stylesheet global: setiap situs
      punya warna gelapnya sendiri, dan situs bermode terang tidak ikut membayar
      CSS yang tidak dipakainya.
- [x] Mode "ikut perangkat" dibungkus `prefers-color-scheme`, jadi pengunjung
      bermode terang tetap melihat versi terang.
- [x] Kanvas builder memakai aturan yang sama, jadi mode gelap terlihat apa
      adanya saat diedit.
- [x] Warna yang dipilih sendiri pemilik situs lewat pengaturan style per block
      sengaja tidak dipetakan — itu keputusan mereka, bukan warna bawaan tema.
- [x] `text-white` sengaja dibiarkan: dipakai untuk tombol di atas permukaan
      berwarna, dan memetakannya justru menghilangkan kontrasnya.

**Batas yang perlu diketahui:** pemetaan ini mencakup utility warna yang benar-
benar dipakai blok hari ini. Blok baru yang memakai warna di luar daftar itu
akan tetap terang di mode gelap sampai utility-nya ditambahkan ke
`lib/builder-dark-mode.ts`.

## Catatan pemulihan

Saat memecah settings-panel, dua konstanta (`BIO_SOCIAL_OPTIONS` dan
`BIO_LINK_ICON_OPTIONS`) sempat terhapus dari working tree oleh script yang
gagal separuh jalan. Keduanya direkonstruksi dari sumber kebenarannya — enum
`platform` di `bioProfileSocialSchema` dan peta `LINK_ICONS` di
`bio-profile-block.tsx` — bukan dari ingatan. Ada uji yang membandingkan
keduanya terhadap sumber itu, jadi ketidakcocokan akan langsung gagal.

## Perbaikan bug — 19 September 2026

Ditemukan dengan menjalankan aplikasinya, bukan hanya membaca kodenya.

### Gambar kecil justru jadi lebih berat (regresi dari putaran ini)

`BlockImage` punya default `sizes="100vw"`, dan hanya hero yang mengirim nilai
sendiri. Artinya browser diberi tahu bahwa setiap gambar selebar layar penuh —
termasuk avatar 40px dan logo 20px — lalu memilih kandidat 1080w atau 1920w
dari srcset. Untuk elemen kecil itu **lebih berat daripada gambar aslinya**,
jadi perubahan optimasi gambar justru merugikan di tempat-tempat itu.

- [x] Ke-24 pemanggil `BlockImage` diberi `sizes` yang sesuai lebar tampilnya:
      `96px` untuk avatar dan logo, `33vw` untuk kartu dalam grid, `50vw` untuk
      gambar setengah lebar, `100vw` hanya untuk yang benar-benar selebar layar.
- [x] `sizes` dijadikan **wajib**, bukan opsional. Compiler sekarang menolak
      blok baru yang lupa memikirkannya.
- [x] Kandidat lebar kecil ditambahkan (64–384). Sebelumnya yang terkecil 384,
      jadi avatar tetap terpaksa mengambil berkas terlalu besar.
- [x] Diverifikasi terhadap server sungguhan: setiap lebar di srcset dijawab
      HTTP 200 dan dikonversi ke WebP; lebar di luar daftar bawaan Next dijawab
      400. Logo 212 KB turun jadi 1,2 KB pada 64w dan 9,3 KB pada 1080w.

### Halaman depan menandai dirinya sebagai halaman biasa

`isHomePage` disimpulkan dari `Website.homePageId`, padahal kolom itu boleh
kosong — dan di basis data ini **kosong di seluruh situs**. Resolver sebenarnya
jatuh ke slug "home" atau halaman terbit pertama, jadi akar situs tidak pernah
dikenali. Akibatnya setiap halaman depan mengirim `WebPage` plus
`BreadcrumbList` yang butir keduanya menunjuk ke URL-nya sendiri.

- [x] `isHomePage` sekarang berasal dari resolver, satu-satunya yang tahu jalur
      mana yang dipakai: permintaan tanpa slug berarti akar situs.
- [x] Kunci `unstable_cache` diberi versi. Tanpa itu, entri yang ditulis
      sebelum bentuk payload berubah tetap dibaca setelah deploy dengan field
      baru berisi `undefined`, dan bug-nya bertahan sampai cache kedaluwarsa
      sendiri. Naikkan angkanya setiap kali bentuk `ResolvedPublicPage` berubah.
- [x] Diverifikasi di server: akar situs kini `WebSite` tanpa breadcrumb,
      halaman dengan slug tetap `WebPage` dengan breadcrumb.

### Teks template bawaan tampil sebagai karakter rusak

222 kemunculan mojibake di `lib/blocks/templates.ts` plus satu di
`lib/blocks/schema.ts` — byte UTF-8 yang pernah tersimpan sebagai cp1252.
Nama template tampil sebagai `Soleva â€” Shoe Launch` di dialog import, dan
pemisah `·`, centang `✓`, serta panah ikut rusak di seluruh konten template.

- [x] Seluruhnya dipulihkan. Hanya runtun yang benar-benar bisa diputar balik
      yang disentuh, jadi teks beraksen yang memang disengaja tidak ikut
      berubah.
- [x] Uji regresi memindai kedua berkas dan gagal bila mojibake muncul lagi.

### Cakupan uji tambahan

- [x] Setiap pemanggil `BlockImage` mengirim `sizes`, `sizes` tetap wajib, dan
      setiap lebar srcset ada di daftar yang diterima pengoptimal Next.
- [x] Deteksi halaman depan berasal dari resolver, bukan `homePageId`, dan
      kunci cache tetap berversi.
- [x] Kedua berkas blok bebas mojibake.
