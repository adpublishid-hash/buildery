# Billing Optimization Roadmap

Status: implemented on 19 September 2026.

Harga tetap: Starter Rp 120.000/bulan dengan promo Rp 99.000/bulan, Pro
Rp 350.000/bulan dengan promo Rp 299.000/bulan. Pembayaran tetap QRIS dengan
verifikasi manual oleh admin.

## Keamanan dan integritas pembayaran

- [x] `subscribeToPlanAction` menolak plan berbayar. Sebelumnya server action
      ini mengaktifkan plan apa pun tanpa cek pembayaran, sehingga siapa pun
      yang login bisa memanggilnya dari browser dan mendapat Pro gratis.
- [x] Satu-satunya jalan menuju plan berbayar adalah invoice yang disetujui
      admin.
- [x] Penerbitan tagihan dibatasi laju per akun, begitu juga unggahan bukti.
- [x] Bukti transfer hanya diterima dari endpoint unggahan sendiri, divalidasi
      lewat pola URL dan pemeriksaan isi berkas.

## Invoice QRIS

- [x] Model `SaaSInvoice`: nomor, plan, harga normal, harga promo, potongan
      proporsional, kode unik, total, masa berlaku, dan bukti transfer.
- [x] Nomor invoice dan kode unik dibuat di server. Sebelumnya keduanya dihitung
      di komponen client dan tidak pernah disimpan, sehingga admin tidak punya
      baris apa pun untuk dicocokkan dengan transfer yang masuk.
- [x] Kode unik benar-benar unik: kolom `openAmountKey` berisi nominal total
      selama invoice terbuka dan dikosongkan saat selesai, dengan indeks unik.
      Satu nominal transfer hanya bisa dimiliki satu invoice aktif.
- [x] Membuka ulang dialog memakai kembali invoice yang sama. Sebelumnya setiap
      pembukaan menghasilkan nomor dan kode unik baru, sehingga nominal yang
      sudah ditransfer pelanggan tidak pernah cocok lagi.
- [x] Harga dibekukan per invoice, jadi perubahan promo tidak mengubah tagihan
      yang sudah diberikan.
- [x] Tagihan kedaluwarsa melepas kode uniknya kembali ke peredaran.

## Verifikasi dan aktivasi

- [x] Unggah bukti transfer langsung dari dialog pembayaran, menggantikan alur
      keluar ke WhatsApp. Tombol WhatsApp tetap ada sebagai jalur bantuan.
- [x] Antrean verifikasi admin di `/admin/invoices` dengan pratinjau bukti,
      rincian nominal yang harus masuk, dan catatan pelanggan.
- [x] Persetujuan bersifat atomik dan idempoten: klaim status lewat
      compare-and-set, jadi dua admin yang menyetujui bersamaan hanya
      memperpanjang masa aktif satu kali.
- [x] Persetujuan sekaligus menetapkan plan, status, dan periode baru.
      Sebelumnya kontrol admin hanya mengubah status tanpa menyentuh plan atau
      masa aktif, sehingga menyetujui pembayaran Pro tidak memberi plan Pro.
- [x] Penolakan wajib beralasan, dan alasannya dikirim ke pelanggan.
- [x] Email otomatis untuk pembayaran diterima dan bukti ditolak.

## Siklus masa aktif

- [x] `getUserPlan` menagih `currentPeriodEnd`. Sebelumnya hanya memeriksa
      status, sehingga langganan yang berakhir berbulan-bulan lalu tetap
      memberi akses berbayar selamanya.
- [x] Satu fungsi `isSubscriptionEntitled` dipakai bersama oleh penegakan limit
      dan sweep, jadi keduanya tidak pernah berbeda pendapat.
- [x] Job `SAAS_BILLING_SWEEP` tiap jam: menutup tagihan kedaluwarsa, memindah
      langganan jatuh tempo ke PAST_DUE, menurunkan ke Gratis setelah tenggat,
      dan mengirim pengingat.
- [x] Masa tenggang setelah jatuh tempo, karena pembayaran diverifikasi manual
      dan akses tidak boleh mati di detik yang sama dengan jatuh tempo.
- [x] Tagihan perpanjangan dibuat otomatis saat langganan jatuh tempo.
- [x] Pengingat perpanjangan H-7, H-3, dan H-1, masing-masing sekali per
      periode dan direset setiap perpanjangan.
- [x] Pembatalan berlaku di akhir periode, bukan seketika. Sebelumnya menekan
      batal langsung mencabut akses yang sudah dibayar sampai akhir bulan.
- [x] Pembatalan terjadwal bisa dibatalkan lagi selama belum jatuh tempo.

## Upgrade dan downgrade

- [x] Upgrade di tengah periode mendapat potongan sisa nilai plan lama,
      dihitung per hari penuh dan tidak pernah melebihi satu periode.
- [x] Perpanjangan plan yang sama menumpuk di atas sisa masa aktif, bukan
      menghanguskannya.
- [x] Turun ke Gratis saat plan berbayar masih berlaku dijadwalkan di akhir
      periode.
- [x] Memilih plan yang lebih kecil dari pemakaian sekarang memunculkan
      peringatan kuota di dialog pembayaran, sebelum uang dikirim. Downgrade
      tidak menghapus apa pun; hanya pembuatan baru yang terkunci sampai
      pemakaian turun.
- [x] Kode unik tetap ditagih walau potongan menutupi seluruh harga plan —
      transfer Rp 0 tidak bisa dicocokkan.

## Konfigurasi dan operasional

- [x] Model `SaaSBillingSetting`: gambar QRIS, nama merchant, nomor WhatsApp,
      instruksi pembayaran, masa berlaku tagihan, dan masa tenggang.
- [x] Halaman admin `/admin/billing-settings` untuk merotasi semuanya tanpa
      deploy. Sebelumnya QR menumpang domain WordPress eksternal dan nomor
      WhatsApp di-hardcode di komponen client.
- [x] Unggah gambar QRIS langsung ke server sendiri lewat `/api/admin/qris`,
      jadi QR tidak perlu menumpang domain pihak ketiga.
- [x] Peringatan di halaman admin selama QRIS masih di-host di domain lain,
      karena kegagalannya senyap: QR rusak dan transaksi berhenti tanpa error.
- [x] Nomor telepon dinormalkan ke format wa.me otomatis.
- [x] Plan BUSINESS ditandai non-publik, karena tidak pernah ditampilkan di
      halaman harga tetapi masih bisa bocor lewat query lain yang hanya
      memfilter `isPublic`.
- [x] Admin tetap bisa memberikan plan non-publik lewat `/admin/users`.

## Pengalaman pelanggan

- [x] Riwayat tagihan di halaman billing untuk pembukuan.
- [x] Tagihan yang belum selesai ditampilkan di halaman billing, mengarah ke
      QRIS dan nominal yang sama.
- [x] Harga coret dan status masa aktif tampil di halaman billing.
- [x] Hitung mundur masa berlaku tagihan dan tombol salin nominal.
- [x] Seluruh salinan halaman billing dan pengaturan dipindah ke bahasa
      Indonesia, termasuk format tanggal.

## Pelaporan

- [x] Halaman subscriptions admin menampilkan uang yang benar-benar diterima
      bulan berjalan, di samping proyeksi MRR dari langganan aktif.
- [x] Halaman invoices menampilkan antrean verifikasi, tagihan terbuka, dan
      total pembayaran terverifikasi bulan berjalan.

## Cakupan uji

- [x] Aritmetika promo Starter dan Pro.
- [x] Potongan proporsional, penyusunan nominal, pemilihan kode unik, penomoran
      invoice, penambahan bulan, dan tahap pengingat.
- [x] Penegakan masa aktif, termasuk jendela tenggang dan langganan tanpa jatuh
      tempo.
- [x] Penolakan plan berbayar pada `subscribeToPlanAction`, pembatasan laju,
      validasi URL bukti transfer, dan peringatan kuota saat downgrade.
- [x] Uji integrasi terhadap database sungguhan: penerbitan tagihan, jaminan
      kode unik antar pengguna, pemakaian ulang invoice terbuka, idempotensi
      persetujuan, penumpukan perpanjangan, penolakan, pembatalan di akhir
      periode, dan seluruh siklus sweep.

## Catatan operasional

- Terapkan migrasi `20260918180000_saas_billing_engine` sebelum menjalankan
  build aplikasi baru. Migrasi ditulis idempoten dan sudah diuji dijalankan
  dua kali tanpa drift.
- Migrasi memindahkan URL QRIS dan nomor WhatsApp yang sebelumnya di-hardcode
  ke baris `SaaSBillingSetting` bernama `default`, jadi pembayaran tetap jalan
  segera setelah deploy. **Masih menunjuk ke domain eksternal**; buka
  `/admin/billing-settings` dan tekan "Unggah QRIS ke server sendiri" untuk
  memindahkannya. Halaman itu menandai kondisi ini sampai selesai.
- Langganan lama tanpa `currentPeriodEnd` diperlakukan sebagai tanpa jatuh
  tempo. Tidak ada pelanggan yang kehilangan akses saat deploy; berikan tanggal
  jatuh tempo lewat `/admin/subscriptions` bila ingin mereka ikut ditagih.
- Job `SAAS_BILLING_SWEEP` otomatis terdaftar di `RECURRING_JOBS` dan mulai
  berjalan sendiri setelah runner hidup.
- **Diskon 99rb dan 299rb permanen — keputusan pemilik, 19 Sep 2026.** Harga
  sebenarnya adalah Rp 99.000 dan Rp 299.000; `compareAtMonthlyPrice`
  (Rp 120.000 dan Rp 350.000) hanya harga coret sebagai anchor dan sengaja
  tidak punya tanggal berakhir. Tidak ada kolom `promoEndsAt` dan tidak perlu
  ada. Jangan tambahkan jendela promo tanpa keputusan baru.
- Kalau suatu saat promo memang dibatasi, harga sudah dibekukan per invoice,
  jadi tagihan yang sudah terbit tidak akan ikut berubah.
