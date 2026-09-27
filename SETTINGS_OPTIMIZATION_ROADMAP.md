# Settings Optimization Roadmap

Status: implemented on 19 September 2026.

## Izin dan tujuan uang

- [x] Kredensial pembayaran dan tujuan transfer dipindah dari `content.edit` ke
      `workspace.edit`. Sebelumnya peran Editor — yang dijelaskan ke pengguna
      sebagai "tanpa akses kelola anggota atau billing" — tetap bisa mengganti
      kunci Midtrans, menyalakan mode produksi, dan mengubah rekening serta
      QRIS tujuan transfer yang dilihat pembeli saat checkout.
- [x] Pemisahannya per-field, bukan per-tab: Editor tetap bisa mengatur mata
      uang, checkout, ongkir, pajak, dan stok. Yang terkunci hanya field yang
      memegang kredensial atau menentukan ke mana uang mengalir.
- [x] Seluruh CRUD metode pembayaran manual butuh `workspace.edit`.
- [x] Lokasi pickup tetap di `content.edit` — itu alamat, bukan uang.

## Jejak audit

- [x] Perubahan pengaturan eCommerce dan Integrasi kini ditulis ke
      `WorkspaceAuditLog`. Sebelumnya mengganti nama workspace tercatat, tapi
      mengganti kunci Midtrans, token WhatsApp, bot Telegram, rekening tujuan,
      atau menyuntik `customHeadScript` ke seluruh halaman publik toko tidak
      meninggalkan jejak apa pun.
- [x] Yang dicatat adalah nama field yang berubah, tidak pernah nilainya.
- [x] Entri menandai secara eksplisit saat kredensial ikut berubah.
- [x] Penambahan, perubahan, dan penghapusan metode pembayaran manual dicatat
      dengan nama dan jenis metodenya.
- [x] Kegagalan menulis audit dilaporkan, bukan membatalkan simpanan yang sudah
      berhasil.

## Kebersihan penulisan

- [x] Enum tidak lagi di-cast dari string mentah. `ManualPaymentMethodType`,
      `CurrencySymbolPosition`, `PaymentTimeoutUnit`, `StockDecrementTiming`,
      dan satuan berat/dimensi lewat zod, jadi nilai tak dikenal jadi pesan
      validasi alih-alih error mentah dari Postgres.
- [x] Section yang tidak dikenal ditolak. Sebelumnya menghasilkan payload
      kosong: simpanan "berhasil" yang tidak mengubah apa pun.
- [x] Rate limit per pengguna pada penyimpanan pengaturan eCommerce, integrasi,
      dan metode pembayaran.
- [x] Deteksi konflik: form mengirim versi baris saat dimuat, dan penyimpanan
      yang berangkat dari data basi ditolak. Form integrasi punya puluhan field
      di balik satu tombol simpan, jadi dua admin yang menyimpan bersamaan
      dulu membuat yang belakangan menimpa semuanya tanpa peringatan.
- [x] Form lama yang belum mengirim versi tetap dibiarkan lewat — tidak
      mengunci lebih baik daripada menolak simpanan yang sah.

## Umpan balik yang hilang

- [x] Tombol simpan eCommerce kini menampilkan hasilnya. Sebelumnya hasil
      action dibuang, sehingga penolakan izin, konflik, dan galat validasi
      sama-sama berakhir senyap: halaman ter-refresh seolah tersimpan.

## Kredensial

- [x] `INTEGRATION_SECRET_FIELDS` dipecah menjadi dua daftar dengan pertanyaan
      berbeda: field mana yang boleh ditulis lewat form, dan kolom mana yang
      isinya kredensial sehingga tidak boleh sampai ke browser.
- [x] Kolom warisan `whatsappAccessToken`, `whatsappAppSecret`, dan
      `oneSenderApiKey` kini terdaftar sebagai kredensial. Aman selama tidak
      ada yang membacanya, tapi sebelumnya menunggu untuk bocor begitu ada yang
      menampilkannya lagi.
- [x] Uji regresi memindai `schema.prisma` dan menggagalkan build bila ada
      kolom bernama `*token`, `*secret`, `*apiKey`, atau `*password` di
      `IntegrationSetting` yang belum terdaftar.

## Tes koneksi

- [x] Midtrans, Mailketing, Gmail OAuth, Telegram, dan WhatsApp punya tombol
      tes koneksi. Sebelumnya hanya Meta, TikTok, dan GA4 yang punya, sehingga
      kredensial lain baru ketahuan salah saat order pertama gagal atau email
      pertama tidak pernah sampai.
- [x] Setiap tes memakai panggilan termurah yang tetap membuktikan kredensial
      diterima, dan tidak satu pun mengirim pesan ke pelanggan:
      - Midtrans: status satu order yang pasti tidak ada — 404 berarti key
        diterima, 401 berarti ditolak.
      - Gmail: menukar refresh token dengan access token.
      - Telegram: `getMe`.
      - WhatsApp (WABA): membaca profil nomor lewat Graph API.
      - Mailketing: permintaan sengaja tidak lengkap; token salah ditolak
        sebelum isi pesan diperiksa.
- [x] Pesan hasil menyebut mode Midtrans (sandbox atau produksi) dan
      memperingatkan bila gateway-nya masih dinonaktifkan.
- [x] Tes dibatasi laju lebih ketat daripada penyimpanan.

## Akun pengguna sendiri

- [x] Halaman `/dashboard/account`. Sebelumnya seluruh `/dashboard/settings`
      adalah level workspace, dan satu-satunya tulisan ke tabel `User` di
      seluruh server action adalah admin mengubah peran orang lain — tidak ada
      cara bagi siapa pun untuk mengganti namanya sendiri, apalagi passwordnya.
- [x] Ganti nama.
- [x] Ganti password dengan verifikasi password lama, batas percobaan 5 per 15
      menit, dan penolakan password baru yang sama dengan yang lama.
- [x] Akun tanpa password (login lewat penyedia eksternal) diarahkan ke alur
      lupa password, bukan diberi cara memasang password tanpa verifikasi.
- [x] Status verifikasi email ditampilkan.
- [x] Tautan di navigasi dan di tab Bantuan.

## Bahasa

- [x] Pesan galat pengaturan dipindah ke bahasa Indonesia, mengikuti UI-nya.

## Tab Bantuan

- [x] Diisi tautan yang benar-benar menjawab "pengaturan saya sudah benar
      belum": akun, tes integrasi, dan status job terjadwal.

## Cakupan uji

- [x] Editor ditolak saat mengubah kunci Midtrans, menyalakan mode produksi,
      dan menambah atau menghapus rekening tujuan; Admin dan Owner diizinkan.
- [x] Editor tetap bisa menyimpan pengaturan toko non-uang.
- [x] Section tak dikenal, jenis metode pembayaran tak dikenal, penyimpanan
      basi, dan rate limit.
- [x] Audit mencatat nama field dan tidak pernah nilainya.
- [x] Setiap kolom kredensial di `IntegrationSetting` terdaftar.
- [x] Perbandingan field, hint rahasia, dan seluruh enum pengaturan.

## Catatan operasional

- Tidak ada migrasi. Seluruh perubahan ada di lapisan aplikasi.
- **Perubahan perilaku yang perlu diberitahukan ke tim:** anggota dengan peran
  Editor tidak lagi bisa mengubah kredensial pembayaran maupun rekening tujuan
  transfer. Kalau ada yang selama ini mengandalkan itu, naikkan perannya ke
  Admin atau lakukan perubahan itu dari akun Owner/Admin.
- Mengganti password tidak mengakhiri sesi di perangkat lain. `sessionVersion`
  ada di model `Customer`, bukan `User`, jadi invalidasi sesi dashboard butuh
  perubahan di lapisan auth — di luar cakupan putaran ini dan dinyatakan apa
  adanya di halaman akun.
- Ganti email sendiri sengaja tidak disediakan: email dipakai untuk masuk, dan
  menggantinya tanpa verifikasi ulang memindahkan akses login ke alamat yang
  belum tentu milik pemiliknya.
