sekaran# Builder, Template & Block Optimization Roadmap

Status: implemented on 19 September 2026.

## Nomor WhatsApp contoh (P0)

- [x] Template bawaan dulu mengirim `https://wa.me/6281234567890` di 9 tombol
      CTA. Nomor itu sah secara format dan bisa saja milik orang sungguhan;
      pelanggan yang terbit tanpa menggantinya mengirim chat pembelinya ke
      orang asing. Kini diganti `62XXXXXXXXXX` yang tidak bisa dihubungi.
- [x] Saat template diimpor, nomor WhatsApp bisnis workspace
      (`IntegrationSetting.whatsappSenderNumber`) dipasang otomatis bila sudah
      diatur. Builder memberi tahu berapa tombol yang diisi, atau berapa yang
      masih harus diganti.
- [x] Penerbitan **ditolak di server** selama ada tombol WhatsApp berisi nomor
      contoh. Penjagaan ada di keempat jalur penerbitan: route status, route
      pengaturan, dan dua server action di `lib/actions/page.ts`.
- [x] Penjagaan hanya berlaku saat halaman berpindah menjadi terbit. Memeriksa
      ulang halaman yang sudah tayang akan mengunci pemiliknya dari menyunting
      judul SEO atau slug halamannya sendiri.
- [x] Pola yang hampir pasti contoh tapi bisa saja asli (angka berulang,
      123456789) hanya diperingatkan, tidak ditolak.

## Temuan tambahan di jalur penerbitan

- [x] Dua server action di `lib/actions/page.ts` menerbitkan halaman **tanpa
      pemeriksaan apa pun** — aturan "halaman kosong tidak boleh terbit" yang
      ditegakkan API route bisa dilewati lewat keduanya. Kini memakai penjaga
      yang sama.
- [x] `setPageStatusAction` kini memvalidasi status saat runtime. Tipe
      TypeScript tidak berlaku di server action; nilai sembarang dari browser
      dulu langsung diteruskan ke Prisma.

## Audit halaman

- [x] Audit alt text dulu hanya memeriksa `imageUrl`/`imageAlt`, padahal skema
      memakai sepuluh kunci gambar. Hero, blok Gambar, Galeri, avatar, dan
      cover tidak pernah diperiksa — hero tanpa alt tetap dinyatakan lulus.
- [x] Alt dipasangkan per objek dengan fallback yang benar-benar dipakai
      renderer (mis. hero memakai judul bila `mediaAlt` kosong), jadi tidak ada
      peringatan palsu untuk gambar yang sebenarnya sudah punya alt.
- [x] `url` di blok Video adalah alamat embed, bukan gambar — tidak lagi
      dituduh tidak punya alt text.
- [x] Alt bawaan skema seperti "Gallery image" ditandai; tidak kosong tapi
      tidak menjelaskan apa pun.
- [x] Domain contoh (`example.com`, `domainanda`) ditandai.
- [x] Pesan audit dipindah ke bahasa Indonesia.

## Footer ganda

- [x] `PublicBlockRenderer` selalu merender footer "Made with My Landing",
      jadi halaman dari template yang membawa blok Footer tampil dengan dua
      footer — tiga kalau footer toko juga dinyalakan. Kini tepat satu:
      1. blok Footer milik halaman menang atas semuanya;
      2. tanpa itu, footer global layout menang atas footer bawaan.
- [x] Bagian yang diketahui renderer diputuskan di server; bagian yang
      melibatkan layout (yang tidak bisa tahu isi halaman di dalamnya)
      diputuskan lewat `:has()` di `app/globals.css`. Browser tanpa `:has()`
      jatuh ke perilaku lama, tidak lebih buruk.

## Header dan footer situs

- [x] Header dan Footer kini bisa ditandai **"Pakai di semua halaman"**. Isinya
      disimpan sekali di `Website.siteHeader`/`siteFooter` dan dibaca oleh
      setiap halaman yang memakainya. Sebelumnya section tersimpan disisipkan
      sebagai salinan tanpa tautan balik, jadi mengganti satu tautan menu
      berarti menyunting setiap halaman.
- [x] Menyalakan tanda itu mengadopsi versi situs yang sudah ada, bukan
      menimpanya dengan isi halaman ini. Halaman pertama yang menyalakannya
      menjadi sumbernya.
- [x] Footer situs dipakai juga di halaman toko (produk, blog, kursus), jadi
      bagian bawah semua halaman tampil seragam.
- [x] **Kontrol konkurensi.** Builder mengirim sidik jari versi situs yang
      dimuatnya; server hanya menulis balik kalau halaman ini benar-benar
      mengedit header *dan* versi situs belum berubah sejak dimuat. Tanpa itu,
      autosave (setiap 1,8 detik) dari tab yang dibuka sebelum header diubah
      akan diam-diam mengembalikan perubahan itu — cukup dengan mengedit hal
      lain di halaman tersebut. Konflik dilaporkan ke pengguna; halamannya
      sendiri tetap tersimpan.
- [x] Template tidak pernah menandai header/footer-nya sebagai milik situs,
      supaya mengimpor template tidak menimpa header halaman-halaman lain.

**Menyimpang dari rekomendasi awal.** Rekomendasinya adalah halaman builder
memakai header storefront. Setelah dibaca lebih dalam: blok Header punya
layout, tone, CTA, dan sosial media, sedangkan pengaturan storefront hanya
label menu — memakainya berarti menurunkan kualitas header landing page. Dan
header toko membawa keranjang serta akun, yang tidak punya tempat di header
landing. Jadi yang dipakai bersama adalah header/footer *situs* yang kaya;
footer disatukan ke halaman toko, header toko tetap fungsional.

## Tema template

- [x] Tema template kini diterapkan saat impor — lewat pilihan eksplisit
      "Terapkan juga tema template" yang menyatakan cakupannya (semua halaman).
      Sebelumnya `SiteTemplate.designTokens` disimpan tapi tidak pernah dibaca
      siapa pun.

## Foto dan default blok

- [x] 41 foto Unsplash (33 di dalam data blok, 8 pratinjau) dipindah ke
      `public/templates/` (7,2 MB). Sebelumnya setiap halaman pelanggan yang
      memakai template memuat foto 1200–1600px berkualitas 88–90 dari CDN pihak
      ketiga, tanpa srcset, karena `BlockImage` sengaja melewati URL eksternal.
      Lisensi Unsplash mengizinkan pengunduhan dan pemakaian komersial.
- [x] Default blok Gambar, Galeri, dan Slider juga di-host sendiri — setiap
      blok baru dulu dimulai dengan hotlink.
- [x] Default blok Video dulu `dQw4w9WgXcQ` ("Never Gonna Give You Up"). Blok
      yang lupa diganti memutarnya ke pengunjung halaman terbit. Kini kosong,
      dan audit menandai halaman lama yang masih memakainya.

## Blok baru

- [x] **Tombol WhatsApp** — menempel di pojok layar, dengan pesan pembuka,
      posisi, dan jeda kemunculan. Tanpa nomor yang sah, tombolnya tidak
      dirender sama sekali. Di kanvas builder dikembalikan ke alur halaman
      supaya tidak melayang di atas antarmuka.
- [x] **Peta lokasi** — embed Google Maps tanpa API key, alamat, jam buka,
      telepon, dan tombol petunjuk arah. Iframe dimuat malas.
- [x] **Tab** — pola WAI-ARIA lengkap (tablist/tab/tabpanel, panah kiri-kanan,
      Home/End). Panel tersembunyi tetap ada di HTML sehingga tetap dirayapi.
- [x] Nomor di blok Tombol WhatsApp ikut diperiksa audit, penjaga penerbitan,
      dan personalisasi impor.
- [x] Uji paritas antara enum Prisma `BlockType` dan daftar tipe di TypeScript,
      yang sebelumnya tidak ada.

## Template baru

Tujuh template untuk use case yang dijual, tampil lebih dulu di dialog impor:

| Template | Kategori | Blok utama |
| --- | --- | --- |
| Kopi Senja | Toko UMKM | Katalog otomatis, peta kedai, tombol WhatsApp |
| Dapur Rumahan | Produk Digital | Isi per bab (tab), bonus, paket harga |
| Salon Ayu | Jasa Lokal | Layanan per kategori (tab), booking, galeri, peta |
| Kelas Cuan | Webinar & Event | Hitung mundur, rundown, tiket early bird |
| Link in Bio | Link in Bio | Profil bio, tautan, daftar email |
| Ruang Tumbuh | Membership | Benefit, paket membership otomatis |
| Mitra Cuan | Afiliasi | Komisi, cara kerja, CTA afiliasi |

- [x] Blok katalog memakai `source: "auto"`, jadi langsung menampilkan produk
      dan membership pengimpornya, bukan contoh palsu.
- [x] Foto dipilih lalu diperiksa isinya satu per satu sebelum dipakai.
- [x] Delapan template lama (CV dan portofolio) tetap tersedia di bawahnya.

## Mojibake — perbaikan yang sebelumnya baru separuh

- [x] Perbaikan kemarin melewatkan **38 karakter rusak** lagi di template:
      bintang `★`, lingkaran `● ◐`, awan `☁`, dan emoji `🚚 💨 🔒`. Pemindai
      pertama menyebut karakter cp1252 satu per satu dan melewatkan dua; pemindai
      kedua memakai codec cp1252 Python yang menolak byte tak-terdefinisi.
- [x] Tes regresinya dibangun ulang dengan tabel cp1252 eksplisit. Jangan
      ganti dengan `new TextDecoder("windows-1252")`: di Node 22 label itu
      didekode sebagai latin1, sehingga tes konsisten dengan dirinya sendiri
      tapi buta terhadap mojibake sungguhan. Tesnya kini membuktikan diri bisa
      menangkap setiap kasus yang dulu lolos.

## Bahasa

- [x] Semua label dan deskripsi blok dipindah ke bahasa Indonesia secara
      konsisten ("Ajakan bertindak", "Deretan logo", "Testimoni", …).

## Data blok yang tidak valid — diperbaiki 20 September 2026

- [x] `parseBlockData` dulu mengembalikan default **seluruh blok** saat satu
      field tidak valid. Itu bukan sekadar masalah tampilan: builder memuat
      blok lewat fungsi yang sama, jadi pemilik situs melihat isi bawaan lalu
      autosave menulis isi bawaan itu ke database — isi aslinya hilang
      permanen. Docstring-nya sendiri sudah menjanjikan perilaku per-field;
      sekarang kodenya sesuai.
- [x] Hanya field yang tidak valid yang dikembalikan ke default. Satu gambar
      rusak di galeri tidak lagi menghapus gambar lainnya, dan daftar yang
      terlalu panjang dipotong, bukan diganti isi bawaan.
- [x] Field wajib tanpa default yang tetap gagal membuat objek induknya ikut
      dibuang, jadi penyelamatan tidak pernah berputar tanpa akhir.
- [x] Nilai tersimpan tidak pernah diubah di tempat; salinannya yang diperbaiki.
- [x] `parseBlockDataWithReport` melaporkan apa saja yang diperbaiki. Halaman
      publik dan builder mencatatnya ke `/admin/errors` lengkap dengan
      pageId, blockId, dan nama field — kehilangan data tidak lagi tanpa jejak.
- [x] Builder memberi tahu pemilik situs bahwa ada blok yang dikembalikan ke
      default, sebelum autosave menulis versi yang sudah diperbaiki.

## Halaman yang sudah tayang dengan nomor contoh — diperbaiki 20 September 2026

Penjaga penerbitan hanya mencegah halaman *baru*. Halaman yang terbit sebelum
penjaga itu ada masih mengarahkan chat pembeli ke nomor contoh.

- [x] Saat halaman publik dirender: kalau workspace sudah punya nomor bisnis,
      tautan diarahkan ke sana; kalau belum, tautannya dinonaktifkan (`#`) dan
      tombol WhatsApp mengambang disembunyikan. Tombol mati jauh lebih baik
      daripada chat pembeli yang terkirim ke orang asing.
- [x] Data tersimpan tidak diubah. Builder tetap menampilkan nomor aslinya
      lengkap dengan peringatan merah, supaya pemiliknya bisa memperbaikinya.
- [x] Nomor yang sudah benar tidak pernah disentuh.
- [x] Mengganti nomor di Integrasi membuang cache halaman publik, jadi
      perubahannya langsung terlihat.
- [x] Diverifikasi di server: halaman tayang berisi nomor contoh tidak lagi
      memuat nomor itu sama sekali di HTML-nya.

## Catatan operasional

- Terapkan migrasi `20260919140000_site_header_footer` dan
  `20260919160000_block_whatsapp_map_tabs`. Keduanya idempoten dan sudah diuji
  dijalankan dua kali tanpa drift.
- `public/templates/` bertambah 7,2 MB foto template plus 7 foto untuk template
  baru (~1,3 MB); ikut ter-deploy bersama aplikasi.
- Kunci cache halaman publik naik ke `v4`: isi halaman kini bergantung pada
  header/footer situs dan pada nomor WhatsApp bisnis workspace.
- Halaman yang sudah tayang dengan nomor WhatsApp contoh tetap tayang, tapi
  nomornya tidak lagi sampai ke pengunjung; audit di builder menandainya merah
  sampai pemiliknya menggantinya.
- **Produksi belum di-deploy.** Migrasi baru sudah diterapkan ke database
  pengembangan lokal saja. Di VPS, setelah rsync sesuai `DEPLOYMENT.md`:

  ```bash
  pnpm install --frozen-lockfile
  pnpm exec prisma migrate deploy
  pnpm build
  pm2 reload ecosystem.config.js
  ```

  `migrate deploy` hanya menerapkan migrasi yang sudah di-commit dan tidak
  pernah menghapus data.
- Migrasi `20260919150000_superadmin_operations` (bukan dari putaran ini)
  **tidak idempoten** — memakai `ADD COLUMN`/`CREATE TABLE` tanpa
  `IF NOT EXISTS`. Aman untuk penerapan pertama di database yang bersih, tapi
  akan gagal bila dijalankan ulang. Sesuai aturan proyek, migrasi baru wajib
  idempoten.
