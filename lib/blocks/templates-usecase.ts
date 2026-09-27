import type { BlockDataMap, BlockInput, BlockType } from "./schema";
import { blockDataSchemas } from "./schema";
import { resolveBlockAnimation, type AnimationPreset } from "./animation";

/**
 * Template untuk use case yang benar-benar dijual platform ini.
 *
 * Katalog awal berisi delapan template, enam di antaranya CV dan portofolio
 * pribadi — tiga memakai persona yang sama. Tidak satu pun untuk toko UMKM,
 * produk digital, jasa lokal, webinar, link-in-bio, membership, atau afiliasi,
 * padahal itulah fitur yang dijual di plan berbayar.
 *
 * Aturan untuk setiap template di sini:
 * - Tombol WhatsApp memakai nomor placeholder `62XXXXXXXXXX`. Saat diimpor,
 *   nomor bisnis workspace dipasang otomatis bila sudah diatur; kalau belum,
 *   penerbitan ditolak sampai diganti. Jangan pernah memakai nomor yang sah
 *   secara format — nomor contoh bisa milik orang sungguhan.
 * - Header dan Footer tidak pernah bertanda `siteWide`. Mengimpor template
 *   tidak boleh menimpa header situs yang sudah dipakai halaman lain.
 * - Foto di-host sendiri di `/templates/`, bukan hotlink.
 * - Blok katalog (produk, membership) memakai `source: "auto"`, jadi langsung
 *   menampilkan isi toko pengimpornya, bukan contoh palsu.
 */

const WA = "https://wa.me/62XXXXXXXXXX";
const WA_PHONE = "62XXXXXXXXXX";

/**
 * Sengaja memakai `.parse`, bukan `parseBlockData`.
 *
 * `parseBlockData` yang gagal validasi mengembalikan default seluruh blok —
 * satu nilai enum yang salah menghapus semua isi blok itu tanpa pesan apa
 * pun. Untuk data tersimpan itu mencegah halaman rusak total; untuk konten
 * template yang kita tulis sendiri, itu menyembunyikan kesalahan. Di sini
 * kesalahan harus meledak saat tes, bukan diam-diam jadi blok kosong.
 */
function block<T extends BlockType>(type: T, data: Partial<BlockDataMap[T]>) {
  return {
    type,
    data: blockDataSchemas[type].parse(data),
  } as unknown as Extract<BlockInput, { type: T }>;
}

/** Header muncul pelan saat dimuat; sisanya naik halus saat discroll. */
function withMotion(blocks: BlockInput[]): BlockInput[] {
  return blocks.map((item, index) => {
    const preset: AnimationPreset = index === 0 ? "fade" : "reveal-up";
    return {
      ...item,
      data: {
        ...item.data,
        motion: resolveBlockAnimation({
          preset,
          duration: index === 0 ? 0.3 : 0.6,
          distance: index === 0 ? 0 : 28,
          trigger: index === 0 ? "load" : "scroll",
        }),
      },
    };
  }) as BlockInput[];
}

function header(brand: string, tagline: string, cta: string, links: [string, string][]) {
  return block("HEADER", {
    logoText: brand,
    tagline,
    primaryLabel: cta,
    primaryHref: WA,
    layout: "split",
    tone: "light",
    width: "wide",
    buttonStyle: "solid",
    sticky: true,
    mobileMenu: true,
    showLogo: true,
    showNav: true,
    showCta: true,
    navItems: links.map(([label, href]) => ({ label, href, description: "", badge: "" })),
  });
}

function footer(brand: string, description: string) {
  return block("FOOTER", {
    brand,
    description,
    copyright: "Semua hak dilindungi.",
    layout: "columns",
    tone: "soft",
    width: "wide",
    showBrand: true,
    showCopyright: true,
    showSocial: true,
    navItems: [
      { label: "Beranda", href: "#", description: "", badge: "" },
      { label: "Kontak", href: WA, description: "", badge: "" },
    ],
    socialItems: [
      { label: "Instagram", href: "https://instagram.com/", description: "", badge: "" },
      { label: "WhatsApp", href: WA, description: "", badge: "" },
    ],
  });
}

// ============================================================
// Metadata
// ============================================================

export const USE_CASE_TEMPLATES = [
  {
    id: "kopi-senja-umkm",
    name: "Kopi Senja — Toko UMKM",
    category: "Toko UMKM",
    description:
      "Toko online untuk usaha kuliner dan UMKM: katalog produk langsung dari tokomu, pesan lewat WhatsApp, lokasi kedai, dan jawaban soal pengiriman.",
    blockCount: 11,
    previewImage: "/templates/kopi-latte.jpg",
    previewEyebrow: "KOPI SENJA · Sejak 2019",
    previewHeading: "KOPI LOKAL, DISEDUH SEPENUH HATI.",
    accentColor: "#b45309",
    sourceLabel: "UMKM kuliner",
    highlights: ["Katalog otomatis", "Pesan via WhatsApp", "Peta kedai", "Tombol chat mengambang"],
  },
  {
    id: "dapur-rumahan-ebook",
    name: "Dapur Rumahan — E-book Resep",
    category: "Produk Digital",
    description:
      "Halaman jualan produk digital: isi per bab dalam tab, bonus, harga early bird, testimoni pembeli, dan garansi.",
    blockCount: 10,
    previewImage: "/templates/dapur-memasak.jpg",
    previewEyebrow: "E-BOOK · 120 Resep",
    previewHeading: "MASAK ENAK TANPA RIBET.",
    accentColor: "#dc2626",
    sourceLabel: "Produk digital",
    highlights: ["Isi per bab (tab)", "Bonus & garansi", "Paket harga", "Testimoni pembeli"],
  },
  {
    id: "salon-ayu-jasa",
    name: "Salon Ayu — Jasa Lokal",
    category: "Jasa Lokal",
    description:
      "Untuk salon, klinik, laundry, atau jasa lain dengan tempat fisik: daftar layanan dan harga per kategori, cara booking, galeri, dan peta lokasi.",
    blockCount: 10,
    previewImage: "/templates/salon-rambut.jpg",
    previewEyebrow: "SALON AYU · Buka setiap hari",
    previewHeading: "RAMBUT SEHAT, HARI JADI LEBIH BAIK.",
    accentColor: "#db2777",
    sourceLabel: "Jasa lokal",
    highlights: ["Layanan per kategori", "Cara booking", "Galeri", "Peta & jam buka"],
  },
  {
    id: "kelas-cuan-webinar",
    name: "Kelas Cuan — Webinar",
    category: "Webinar & Event",
    description:
      "Pendaftaran webinar atau event: hitung mundur, materi, rundown acara, tiket early bird, dan FAQ teknis.",
    blockCount: 9,
    previewImage: "/templates/webinar-panggung.jpg",
    previewEyebrow: "WEBINAR LIVE · Kuota terbatas",
    previewHeading: "JUALAN ONLINE YANG BENAR-BENAR LAKU.",
    accentColor: "#4f46e5",
    sourceLabel: "Webinar & event",
    highlights: ["Hitung mundur", "Rundown acara", "Tiket early bird", "FAQ teknis"],
  },
  {
    id: "link-in-bio-kreator",
    name: "Link in Bio — Kreator",
    category: "Link in Bio",
    description:
      "Satu halaman untuk semua tautanmu: profil, sosial media, produk unggulan, dan daftar email — ringan dibuka dari Instagram atau TikTok.",
    blockCount: 3,
    previewImage: "/templates/1434626881859-194d67b2b8-124c3fcc.jpg",
    previewEyebrow: "LINK IN BIO",
    previewHeading: "SEMUA TAUTANMU, SATU HALAMAN.",
    accentColor: "#0f766e",
    sourceLabel: "Link in bio",
    highlights: ["Profil & sosial media", "Daftar tautan", "Daftar email"],
  },
  {
    id: "ruang-tumbuh-membership",
    name: "Ruang Tumbuh — Membership",
    category: "Membership",
    description:
      "Komunitas berbayar atau konten eksklusif: benefit anggota, paket membership langsung dari tokomu, cerita anggota, dan FAQ.",
    blockCount: 8,
    previewImage: "/templates/1552664730-d307ca884978-93fc4356.jpg",
    previewEyebrow: "MEMBERSHIP · Komunitas",
    previewHeading: "TUMBUH BARENG, BUKAN SENDIRIAN.",
    accentColor: "#7c3aed",
    sourceLabel: "Membership",
    highlights: ["Benefit anggota", "Paket otomatis", "Cerita anggota", "FAQ"],
  },
  {
    id: "mitra-cuan-afiliasi",
    name: "Mitra Cuan — Program Afiliasi",
    category: "Afiliasi",
    description:
      "Rekrut mitra afiliasi: besaran komisi, cara kerja, contoh penghasilan, dan tombol daftar ke program afiliasi tokomu.",
    blockCount: 8,
    previewImage: "/templates/1556761175-b413da4baf72-f2df8b2a.jpg",
    previewEyebrow: "PROGRAM AFILIASI",
    previewHeading: "REKOMENDASIKAN, LALU DAPAT KOMISI.",
    accentColor: "#059669",
    sourceLabel: "Afiliasi",
    highlights: ["Besaran komisi", "Cara kerja", "Contoh penghasilan", "FAQ mitra"],
  },
] as const;

export type UseCaseTemplateId = (typeof USE_CASE_TEMPLATES)[number]["id"];

// ============================================================
// Isi
// ============================================================

function kopiSenja(): BlockInput[] {
  return withMotion([
    header("Kopi Senja", "Kopi lokal Nusantara", "Pesan via WhatsApp", [
      ["Menu", "#menu"],
      ["Tentang", "#tentang"],
      ["Lokasi", "#lokasi"],
    ]),
    block("HERO", {
      eyebrow: "Biji kopi pilihan dari petani lokal",
      badge: "Gratis ongkir se-kota untuk 2 bungkus",
      heading: "Kopi lokal, disangrai tiap minggu, sampai di rumahmu masih segar.",
      subheading:
        "Kami menyangrai dalam jumlah kecil supaya setiap bungkus yang kamu terima tidak lebih tua dari tujuh hari. Pilih biji utuh atau bubuk sesuai alat seduhmu.",
      primaryLabel: "Lihat Menu",
      primaryHref: "#menu",
      secondaryLabel: "Tanya via WhatsApp",
      secondaryHref: WA,
      mediaUrl: "/templates/kopi-latte.jpg",
      mediaAlt: "Dua cangkir latte dengan latte art di atas meja kayu",
      trustText: "★ 4,9/5 dari pelanggan tetap · Disangrai setiap Senin",
    }),
    block("MARQUEE", {
      items: [
        { text: "Disangrai setiap minggu", icon: "☕", href: "" },
        { text: "Langsung dari petani", icon: "🌱", href: "" },
        { text: "Gratis ongkir se-kota", icon: "🚚", href: "" },
        { text: "Bisa COD", icon: "✓", href: "" },
      ],
    }),
    block("PRODUCT_SHOWCASE", {
      eyebrow: "Menu",
      heading: "Pilihan kopi minggu ini",
      subheading: "Produk di bawah otomatis mengikuti katalog tokomu.",
      source: "auto",
      limit: 6,
      columns: 3,
      buttonLabel: "Lihat semua produk",
      buttonHref: "/products",
    }),
    block("FEATURE_GRID", {
      eyebrow: "Kenapa Kopi Senja",
      heading: "Segar itu bukan janji. Itu jadwal sangrai kami.",
      columns: 3,
      layout: "cards",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "", icon: "🔥", title: "Sangrai kecil", description: "Paling banyak 5 kg per sesi, jadi profil rasanya konsisten dari bungkus ke bungkus.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "", icon: "🌱", title: "Petani yang kami kenal", description: "Kami membeli langsung dari kebun di Gayo, Toraja, dan Flores — dengan harga yang adil.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "", icon: "✉", title: "Tanggal sangrai di bungkus", description: "Setiap bungkus mencantumkan tanggal sangrai, bukan hanya tanggal kedaluwarsa.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
      ],
    }),
    block("TESTIMONIAL", {
      eyebrow: "Kata pelanggan",
      heading: "Yang sudah langganan tiap bulan",
      layout: "grid",
      columns: 3,
      items: [
        { quote: "Aroma waktu bungkusnya dibuka beda dengan kopi supermarket. Sekarang langganan tiap bulan.", authorName: "Rina", authorRole: "Pelanggan sejak 2022", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
        { quote: "Pesan lewat WhatsApp, sore itu juga sampai. Admin-nya sabar jelasin mana yang cocok buat V60.", authorName: "Dimas", authorRole: "Pecinta kopi manual brew", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "Toraja-nya enak banget buat kopi susu di rumah. Pas, tidak terlalu asam.", authorName: "Sari", authorRole: "Ibu rumah tangga", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),
    block("MAP", {
      eyebrow: "Mampir ke kedai",
      heading: "Ngopi langsung di tempat",
      description: "Selain pesan antar, kamu bisa mencicipi semua biji kami di kedai.",
      address: "Jl. Contoh No. 12, Kota Anda",
      openingHours: "Setiap hari, 08.00–22.00",
      layout: "split",
      showDirections: true,
    }),
    block("FAQ", {
      eyebrow: "Pertanyaan",
      heading: "Sebelum kamu memesan",
      layout: "two-column",
      items: [
        { question: "Berapa lama pengiriman?", answer: "Dalam kota sampai di hari yang sama untuk pesanan sebelum pukul 14.00. Luar kota 2–4 hari kerja.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: true },
        { question: "Biji utuh atau bubuk?", answer: "Biji utuh lebih tahan lama. Kalau belum punya grinder, pilih bubuk dan sebutkan alat seduhmu — kami giling sesuai kebutuhan.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Bisa bayar di tempat (COD)?", answer: "Bisa untuk pengiriman dalam kota.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),
    block("CTA", {
      heading: "Kopi segar minggu ini tinggal sedikit.",
      description: "Kami hanya menyangrai sekali seminggu. Pesan sekarang supaya kebagian batch ini.",
      buttonLabel: "Pesan via WhatsApp",
      buttonHref: WA,
      secondaryLabel: "Lihat menu",
      secondaryHref: "#menu",
      imageUrl: "/templates/kopi-meja.jpg",
      imageAlt: "Beberapa cangkir latte di meja kedai",
      layout: "background",
      tone: "dark",
    }),
    footer("Kopi Senja", "Kopi lokal Nusantara, disangrai setiap minggu."),
    block("WHATSAPP_FLOAT", {
      phone: WA_PHONE,
      message: "Halo Kopi Senja, saya mau pesan kopi.",
      label: "Pesan via WhatsApp",
      delaySeconds: 3,
    }),
  ]);
}

function dapurRumahan(): BlockInput[] {
  return withMotion([
    header("Dapur Rumahan", "E-book resep praktis", "Beli E-book", [
      ["Isi", "#isi"],
      ["Bonus", "#bonus"],
      ["Harga", "#harga"],
    ]),
    block("HERO", {
      eyebrow: "E-book · 120 resep · PDF",
      badge: "Harga early bird berakhir minggu ini",
      heading: "Masak enak setiap hari, tanpa bingung mau masak apa.",
      subheading:
        "120 resep rumahan dengan bahan yang ada di pasar dekat rumah, lengkap dengan daftar belanja mingguan. Langsung terkirim ke email setelah pembayaran.",
      primaryLabel: "Ambil E-book",
      primaryHref: "#harga",
      secondaryLabel: "Lihat isinya",
      secondaryHref: "#isi",
      mediaUrl: "/templates/dapur-memasak.jpg",
      mediaAlt: "Pasangan memasak bersama di dapur rumah",
      trustText: "★ 4,8/5 dari 2.300+ pembeli",
    }),
    block("STATS", {
      layout: "strip",
      tone: "soft",
      columns: 4,
      align: "center",
      items: [
        { icon: "", value: "120", label: "Resep", description: "", trend: "", highlighted: false },
        { icon: "", value: "30 mnt", label: "Rata-rata waktu masak", description: "", trend: "", highlighted: false },
        { icon: "", value: "4", label: "Minggu menu siap pakai", description: "", trend: "", highlighted: true },
        { icon: "", value: "2.300+", label: "Pembeli", description: "", trend: "", highlighted: false },
      ],
    }),
    block("TABS", {
      eyebrow: "Isi e-book",
      heading: "Empat bab, satu dapur yang lebih tenang",
      variant: "pills",
      tabs: [
        { label: "Sarapan", heading: "30 resep sarapan di bawah 20 menit", body: "Nasi goreng kampung, bubur ayam, roti bakar isi, dan menu sarapan lain yang bisa disiapkan sebelum anak berangkat sekolah.", imageUrl: "", imageAlt: "", ctaLabel: "", ctaHref: "#" },
        { label: "Lauk harian", heading: "50 lauk untuk makan siang dan malam", body: "Ayam, ikan, tahu-tempe, dan sayur dengan bumbu dasar yang sama, jadi belanja sekali bisa untuk beberapa menu.", imageUrl: "", imageAlt: "", ctaLabel: "", ctaHref: "#" },
        { label: "Camilan", heading: "25 camilan untuk keluarga", body: "Camilan tanpa pengawet untuk bekal sekolah dan teman ngopi sore.", imageUrl: "", imageAlt: "", ctaLabel: "", ctaHref: "#" },
        { label: "Menu mingguan", heading: "4 minggu menu + daftar belanja", body: "Rencana menu Senin sampai Minggu dengan daftar belanja per minggu, supaya tidak ada bahan yang terbuang.", imageUrl: "", imageAlt: "", ctaLabel: "", ctaHref: "#" },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Bonus",
      heading: "Tambahan untuk pembelian minggu ini",
      columns: 3,
      layout: "cards",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "Bonus 1", icon: "📋", title: "Template daftar belanja", description: "Bisa dicetak atau dipakai di ponsel.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "Bonus 2", icon: "🧂", title: "Panduan bumbu dasar", description: "Bumbu putih, merah, dan kuning untuk stok seminggu.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "Bonus 3", icon: "💬", title: "Grup tanya-jawab", description: "Tanya langsung kalau ada resep yang gagal.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: true },
      ],
    }),
    block("PRICING", {
      eyebrow: "Harga",
      heading: "Sekali bayar, akses selamanya",
      billingNote: "Harga contoh — ubah sesuai produkmu.",
      layout: "featured",
      columns: 2,
      align: "center",
      plans: [
        { badge: "", name: "E-book saja", price: "Rp79.000", period: "", description: "120 resep dalam PDF.", features: ["120 resep", "Menu 4 minggu"], excludedFeatures: ["Bonus", "Grup tanya-jawab"], note: "", highlighted: false, ctaLabel: "Beli E-book", ctaHref: "/products", secondaryLabel: "", secondaryHref: "" },
        { badge: "Paling banyak dipilih", name: "E-book + Bonus", price: "Rp99.000", period: "", description: "Semua isi plus ketiga bonus.", features: ["120 resep", "Menu 4 minggu", "3 bonus", "Grup tanya-jawab"], excludedFeatures: [], note: "Garansi 7 hari uang kembali", highlighted: true, ctaLabel: "Ambil Paket Lengkap", ctaHref: "/products", secondaryLabel: "", secondaryHref: "" },
      ],
    }),
    block("TESTIMONIAL", {
      eyebrow: "Pembeli",
      heading: "Dapur yang lebih tenang",
      layout: "grid",
      columns: 3,
      items: [
        { quote: "Menu mingguannya yang paling membantu. Belanja sekali, seminggu tidak pusing lagi.", authorName: "Wulan", authorRole: "Ibu dua anak", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "Resepnya pakai bahan yang gampang dicari. Suami sampai nambah terus.", authorName: "Fitri", authorRole: "Karyawan", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
        { quote: "Anak kos juga bisa. Bab sarapannya cepat semua.", authorName: "Bagas", authorRole: "Mahasiswa", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),
    block("FAQ", {
      eyebrow: "Pertanyaan",
      heading: "Tentang e-book",
      layout: "two-column",
      items: [
        { question: "Bagaimana cara menerima e-book?", answer: "Tautan unduhan dikirim ke email segera setelah pembayaran dikonfirmasi.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: true },
        { question: "Bisa dibuka di ponsel?", answer: "Bisa. Formatnya PDF dan nyaman dibaca di ponsel maupun dicetak.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Kalau tidak cocok?", answer: "Paket lengkap punya garansi 7 hari uang kembali, tanpa pertanyaan.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),
    block("CTA", {
      heading: "Masak malam ini sudah terjawab.",
      description: "Unduh sekarang dan mulai dari menu minggu pertama.",
      buttonLabel: "Ambil E-book",
      buttonHref: "/products",
      secondaryLabel: "Tanya dulu",
      secondaryHref: WA,
      layout: "card",
      tone: "accent",
    }),
    footer("Dapur Rumahan", "Resep rumahan yang praktis untuk setiap hari."),
  ]);
}

function salonAyu(): BlockInput[] {
  return withMotion([
    header("Salon Ayu", "Perawatan rambut & wajah", "Booking via WhatsApp", [
      ["Layanan", "#layanan"],
      ["Galeri", "#galeri"],
      ["Lokasi", "#lokasi"],
    ]),
    block("HERO", {
      eyebrow: "Salon keluarga sejak 2015",
      badge: "Diskon 20% untuk pelanggan baru",
      heading: "Rambut sehat, hari jadi lebih baik.",
      subheading:
        "Potong, warna, dan perawatan rambut oleh stylist berpengalaman. Booking dulu lewat WhatsApp supaya kamu tidak perlu menunggu.",
      primaryLabel: "Booking Sekarang",
      primaryHref: WA,
      secondaryLabel: "Lihat daftar harga",
      secondaryHref: "#layanan",
      mediaUrl: "/templates/salon-rambut.jpg",
      mediaAlt: "Perempuan dengan rambut panjang bergelombang yang sehat",
      trustText: "★ 4,9/5 di Google · Buka setiap hari",
    }),
    block("TABS", {
      eyebrow: "Layanan & harga",
      heading: "Pilih perawatanmu",
      variant: "underline",
      tabs: [
        { label: "Rambut", heading: "Potong & styling", body: "Potong rambut wanita — Rp75.000\nPotong rambut pria — Rp50.000\nBlow dry — Rp60.000\nSmoothing — mulai Rp350.000", imageUrl: "", imageAlt: "", ctaLabel: "Booking potong rambut", ctaHref: WA },
        { label: "Warna", heading: "Pewarnaan", body: "Cat rambut satu warna — mulai Rp250.000\nHighlight — mulai Rp400.000\nBalayage — mulai Rp650.000", imageUrl: "", imageAlt: "", ctaLabel: "Konsultasi warna", ctaHref: WA },
        { label: "Perawatan", heading: "Perawatan rambut & wajah", body: "Creambath — Rp80.000\nHair mask — Rp120.000\nFacial basic — Rp150.000", imageUrl: "", imageAlt: "", ctaLabel: "Booking perawatan", ctaHref: WA },
      ],
    }),
    block("STEPS", {
      eyebrow: "Cara booking",
      heading: "Tiga langkah, tanpa antre",
      layout: "cards",
      columns: 3,
      align: "left",
      markerStyle: "number",
      items: [
        { eyebrow: "", icon: "", title: "Chat WhatsApp", description: "Sebutkan layanan dan jam yang kamu inginkan.", meta: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "", icon: "", title: "Terima konfirmasi", description: "Kami kirim konfirmasi jadwal dan nama stylist.", meta: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "", icon: "", title: "Datang tepat waktu", description: "Tidak perlu menunggu, kursimu sudah disiapkan.", meta: "", linkLabel: "", linkHref: "", highlighted: false },
      ],
    }),
    block("GALLERY", {
      eyebrow: "Galeri",
      heading: "Suasana salon",
      columns: 2,
      aspectRatio: "wide",
      items: [
        { url: "/templates/salon-interior.jpg", alt: "Ruang salon dengan kursi dan cermin besar", title: "", caption: "", href: "", featured: false },
        { url: "/templates/salon-rambut.jpg", alt: "Hasil perawatan rambut panjang bergelombang", title: "", caption: "", href: "", featured: false },
      ],
    }),
    block("TESTIMONIAL", {
      eyebrow: "Ulasan",
      heading: "Pelanggan yang kembali lagi",
      layout: "grid",
      columns: 3,
      items: [
        { quote: "Stylist-nya mendengarkan dulu maunya apa. Hasilnya persis seperti yang saya bayangkan.", authorName: "Maya", authorRole: "Pelanggan balayage", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "Booking lewat WhatsApp gampang, datang langsung dikerjakan.", authorName: "Tika", authorRole: "Pelanggan rutin", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
        { quote: "Tempatnya bersih dan nyaman. Anak saya juga potong di sini.", authorName: "Hendra", authorRole: "Ayah dua anak", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),
    block("MAP", {
      eyebrow: "Lokasi",
      heading: "Kunjungi Salon Ayu",
      address: "Jl. Contoh No. 45, Kota Anda",
      openingHours: "Senin–Minggu, 09.00–20.00",
      layout: "split",
      showDirections: true,
    }),
    block("FAQ", {
      eyebrow: "Pertanyaan",
      heading: "Sebelum datang",
      layout: "two-column",
      items: [
        { question: "Harus booking dulu?", answer: "Disarankan, terutama akhir pekan. Tanpa booking tetap dilayani selama ada kursi kosong.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: true },
        { question: "Bisa konsultasi warna dulu?", answer: "Bisa dan gratis. Kirim foto rambutmu lewat WhatsApp.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Pembayaran pakai apa?", answer: "Tunai, QRIS, dan transfer bank.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),
    footer("Salon Ayu", "Perawatan rambut dan wajah untuk seluruh keluarga."),
    block("WHATSAPP_FLOAT", {
      phone: WA_PHONE,
      message: "Halo Salon Ayu, saya mau booking.",
      label: "Booking via WhatsApp",
      delaySeconds: 3,
    }),
  ]);
}

function kelasCuan(): BlockInput[] {
  const eventDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  return withMotion([
    header("Kelas Cuan", "Webinar jualan online", "Daftar Sekarang", [
      ["Materi", "#materi"],
      ["Rundown", "#rundown"],
      ["Tiket", "#tiket"],
    ]),
    block("HERO", {
      eyebrow: "Webinar live via Zoom · Sabtu, 19.30 WIB",
      badge: "Kuota 300 peserta",
      heading: "Jualan online yang benar-benar laku, bukan sekadar ramai.",
      subheading:
        "Dua jam praktik langsung: menulis caption yang menjual, memotret produk dengan ponsel, dan mengubah chat menjadi pesanan.",
      primaryLabel: "Amankan Kursi",
      primaryHref: "#tiket",
      secondaryLabel: "Lihat materi",
      secondaryHref: "#materi",
      mediaUrl: "/templates/webinar-panggung.jpg",
      mediaAlt: "Pembicara presentasi di depan layar besar dengan penonton",
      trustText: "★ 4,8/5 dari 1.500+ alumni webinar",
    }),
    block("COUNTDOWN", {
      heading: "Harga early bird berakhir dalam",
      targetDate: eventDate,
      layout: "cards",
      tone: "accent",
      ctaLabel: "Daftar dengan harga early bird",
      ctaHref: "#tiket",
    }),
    block("FEATURE_GRID", {
      eyebrow: "Materi",
      heading: "Yang akan kamu praktikkan",
      columns: 3,
      layout: "cards",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "Sesi 1", icon: "✍", title: "Caption yang menjual", description: "Rumus menulis caption dari manfaat, bukan dari fitur.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "Sesi 2", icon: "📷", title: "Foto produk dengan ponsel", description: "Cahaya alami dan latar sederhana yang membuat produk terlihat mahal.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "Sesi 3", icon: "💬", title: "Dari chat jadi pesanan", description: "Template balasan WhatsApp untuk calon pembeli yang ragu.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: true },
      ],
    }),
    block("STEPS", {
      eyebrow: "Rundown",
      heading: "Susunan acara",
      layout: "timeline",
      align: "left",
      markerStyle: "number",
      items: [
        { eyebrow: "19.30", icon: "", title: "Pembukaan", description: "Perkenalan dan target malam ini.", meta: "10 menit", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "19.40", icon: "", title: "Materi & praktik", description: "Tiga sesi, masing-masing diakhiri praktik langsung.", meta: "90 menit", linkLabel: "", linkHref: "", highlighted: true },
        { eyebrow: "21.10", icon: "", title: "Tanya jawab", description: "Bawa pertanyaan tentang produkmu sendiri.", meta: "20 menit", linkLabel: "", linkHref: "", highlighted: false },
      ],
    }),
    block("PRICING", {
      eyebrow: "Tiket",
      heading: "Pilih tiketmu",
      billingNote: "Harga contoh — ubah sesuai acaramu.",
      layout: "featured",
      columns: 2,
      align: "center",
      plans: [
        { badge: "Early bird", name: "Tiket Live", price: "Rp49.000", period: "", description: "Ikut webinar secara langsung.", features: ["Akses live Zoom", "Materi PDF"], excludedFeatures: ["Rekaman"], note: "", highlighted: false, ctaLabel: "Beli Tiket Live", ctaHref: "/products", secondaryLabel: "", secondaryHref: "" },
        { badge: "Paling banyak dipilih", name: "Live + Rekaman", price: "Rp79.000", period: "", description: "Tonton ulang kapan saja.", features: ["Akses live Zoom", "Materi PDF", "Rekaman 30 hari", "Template caption"], excludedFeatures: [], note: "", highlighted: true, ctaLabel: "Beli Paket Lengkap", ctaHref: "/products", secondaryLabel: "", secondaryHref: "" },
      ],
    }),
    block("FAQ", {
      eyebrow: "Pertanyaan",
      heading: "Sebelum mendaftar",
      layout: "two-column",
      items: [
        { question: "Tautan Zoom dikirim kapan?", answer: "H-1 dan dua jam sebelum acara, ke email dan WhatsApp yang kamu daftarkan.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: true },
        { question: "Kalau berhalangan hadir?", answer: "Pilih paket dengan rekaman supaya bisa ditonton ulang selama 30 hari.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Cocok untuk pemula?", answer: "Cocok. Semua praktik bisa dilakukan hanya dengan ponsel.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),
    block("CTA", {
      heading: "Kursi terbatas, harga early bird lebih terbatas lagi.",
      description: "Daftar sekarang dan dapatkan template caption gratis.",
      buttonLabel: "Amankan Kursi",
      buttonHref: "#tiket",
      secondaryLabel: "Tanya panitia",
      secondaryHref: WA,
      imageUrl: "/templates/webinar-peserta.jpg",
      imageAlt: "Peserta seminar di ruangan gelap",
      layout: "background",
      tone: "dark",
    }),
    footer("Kelas Cuan", "Webinar praktik jualan online untuk UMKM."),
  ]);
}

function linkInBio(): BlockInput[] {
  return withMotion([
    block("BIO_PROFILE", {
      name: "Nama Kamu",
      title: "Kreator konten · Resep & gaya hidup",
      bio: "Berbagi resep praktis dan cerita dapur setiap hari. Semua tautan penting ada di sini.",
      location: "Indonesia",
      avatarUrl: "/avatar/12.png",
      avatarAlt: "Foto profil kreator",
      verified: true,
      showStats: true,
      showSocials: true,
      showLinks: true,
      socials: [
        { platform: "instagram", label: "", href: "https://instagram.com/", ariaLabel: "", openInNewTab: true, noFollow: false },
        { platform: "tiktok", label: "", href: "https://tiktok.com/", ariaLabel: "", openInNewTab: true, noFollow: false },
        { platform: "youtube", label: "", href: "https://youtube.com/", ariaLabel: "", openInNewTab: true, noFollow: false },
        { platform: "whatsapp", label: "", href: WA, ariaLabel: "", openInNewTab: true, noFollow: false },
      ],
      links: [
        { label: "E-book 120 resep rumahan", description: "Paling banyak dibeli minggu ini", meta: "", href: "/products", icon: "shop", thumbnail: "", badge: "Baru", ariaLabel: "", highlighted: true, openInNewTab: false, noFollow: false },
        { label: "Kelas masak online", description: "Setiap Sabtu malam", meta: "", href: "/courses", icon: "calendar", thumbnail: "", badge: "", ariaLabel: "", highlighted: false, openInNewTab: false, noFollow: false },
        { label: "Kerja sama & endorsement", description: "Hubungi lewat WhatsApp", meta: "", href: WA, icon: "message", thumbnail: "", badge: "", ariaLabel: "", highlighted: false, openInNewTab: true, noFollow: false },
      ],
      stats: [
        { value: "120K", label: "Pengikut" },
        { value: "500+", label: "Resep" },
        { value: "4,9", label: "Rating kelas" },
      ],
    }),
    block("NEWSLETTER", {
      eyebrow: "Resep mingguan",
      heading: "Dapat resep baru setiap Jumat",
      description: "Satu email seminggu, tanpa spam.",
      buttonLabel: "Langganan",
      placeholder: "Alamat email kamu",
      compact: true,
    }),
    block("WHATSAPP_FLOAT", {
      phone: WA_PHONE,
      message: "Halo, saya mau tanya.",
      label: "Chat",
      showLabel: false,
    }),
  ]);
}

function ruangTumbuh(): BlockInput[] {
  return withMotion([
    header("Ruang Tumbuh", "Komunitas pebisnis online", "Gabung", [
      ["Benefit", "#benefit"],
      ["Paket", "#paket"],
      ["FAQ", "#faq"],
    ]),
    block("HERO", {
      eyebrow: "Komunitas membership",
      badge: "Pintu dibuka setiap awal bulan",
      heading: "Tumbuh bareng, bukan sendirian.",
      subheading:
        "Komunitas untuk pemilik usaha online: kelas bulanan, sesi tanya jawab langsung, dan grup diskusi dengan sesama anggota.",
      primaryLabel: "Lihat Paket",
      primaryHref: "#paket",
      secondaryLabel: "Tanya dulu",
      secondaryHref: WA,
      mediaUrl: "/templates/1552664730-d307ca884978-93fc4356.jpg",
      mediaAlt: "Sekelompok orang berdiskusi dalam lokakarya",
      trustText: "800+ anggota aktif",
    }),
    block("FEATURE_GRID", {
      eyebrow: "Benefit anggota",
      heading: "Yang kamu dapat setiap bulan",
      columns: 3,
      layout: "cards",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "", icon: "🎓", title: "Kelas bulanan", description: "Satu topik mendalam setiap bulan, rekamannya bisa ditonton ulang.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "", icon: "🎙", title: "Tanya jawab langsung", description: "Sesi dua mingguan untuk membahas masalah usahamu.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: true },
        { eyebrow: "", icon: "👥", title: "Grup diskusi", description: "Bertukar pengalaman dengan pemilik usaha lain.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "", highlighted: false },
      ],
    }),
    block("MEMBERSHIP_SHOWCASE", {
      eyebrow: "Paket",
      heading: "Pilih paket membership",
      subheading: "Paket di bawah otomatis mengikuti membership di tokomu.",
      source: "auto",
      limit: 3,
      columns: 3,
    }),
    block("TESTIMONIAL", {
      eyebrow: "Cerita anggota",
      heading: "Yang sudah bergabung",
      layout: "grid",
      columns: 3,
      items: [
        { quote: "Sesi tanya jawabnya yang paling berharga. Masalah stok saya selesai dalam satu sesi.", authorName: "Anisa", authorRole: "Pemilik toko hijab", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "Ketemu supplier baru dari grup diskusi.", authorName: "Rudi", authorRole: "Penjual sparepart", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
        { quote: "Kelas bulanannya praktis, langsung bisa dipakai.", authorName: "Lestari", authorRole: "Pemilik katering", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),
    block("FAQ", {
      eyebrow: "Pertanyaan",
      heading: "Tentang membership",
      layout: "two-column",
      items: [
        { question: "Bisa berhenti kapan saja?", answer: "Bisa. Akses tetap berjalan sampai akhir periode yang sudah dibayar.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: true },
        { question: "Kalau terlewat kelas bulanan?", answer: "Semua kelas direkam dan bisa ditonton ulang selama kamu masih anggota.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),
    block("CTA", {
      heading: "Pintu bulan ini masih terbuka.",
      description: "Bergabung sekarang dan ikut kelas bulan ini.",
      buttonLabel: "Gabung Sekarang",
      buttonHref: "#paket",
      layout: "card",
      tone: "accent",
    }),
    footer("Ruang Tumbuh", "Komunitas untuk pemilik usaha online."),
  ]);
}

function mitraCuan(): BlockInput[] {
  return withMotion([
    header("Mitra Cuan", "Program afiliasi", "Daftar Jadi Mitra", [
      ["Komisi", "#komisi"],
      ["Cara kerja", "#cara-kerja"],
      ["FAQ", "#faq"],
    ]),
    block("HERO", {
      eyebrow: "Program afiliasi",
      badge: "Gratis mendaftar",
      heading: "Rekomendasikan produk yang kamu suka, dapatkan komisi setiap penjualan.",
      subheading:
        "Bagikan tautan unikmu. Setiap pembelian lewat tautan itu tercatat otomatis dan komisinya dibayarkan setiap bulan.",
      primaryLabel: "Daftar Jadi Mitra",
      primaryHref: "/affiliate",
      secondaryLabel: "Lihat cara kerja",
      secondaryHref: "#cara-kerja",
      mediaUrl: "/templates/1556761175-b413da4baf72-f2df8b2a.jpg",
      mediaAlt: "Tim bekerja bersama di ruang kerja",
      trustText: "Komisi dibayarkan tanggal 10 setiap bulan",
    }),
    block("STATS", {
      layout: "strip",
      tone: "soft",
      columns: 3,
      align: "center",
      items: [
        { icon: "", value: "20%", label: "Komisi per penjualan", description: "", trend: "", highlighted: true },
        { icon: "", value: "30 hari", label: "Masa berlaku cookie", description: "", trend: "", highlighted: false },
        { icon: "", value: "Rp100.000", label: "Minimum pencairan", description: "", trend: "", highlighted: false },
      ],
    }),
    block("AFFILIATE_CTA", {
      eyebrow: "Komisi",
      heading: "Penghasilan tambahan tanpa stok barang",
      description: "Kamu fokus berbagi; urusan produk, pengiriman, dan layanan pelanggan kami yang tangani.",
      primaryLabel: "Daftar Sekarang",
      primaryHref: "/affiliate",
      showStats: true,
      showBenefits: true,
    }),
    block("STEPS", {
      eyebrow: "Cara kerja",
      heading: "Mulai dalam tiga langkah",
      layout: "cards",
      columns: 3,
      align: "left",
      markerStyle: "number",
      items: [
        { eyebrow: "", icon: "", title: "Daftar", description: "Isi formulir singkat dan tunggu persetujuan.", meta: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "", icon: "", title: "Bagikan tautan", description: "Salin tautan unik dari dashboard mitra dan bagikan ke pengikutmu.", meta: "", linkLabel: "", linkHref: "", highlighted: false },
        { eyebrow: "", icon: "", title: "Terima komisi", description: "Komisi tercatat otomatis dan dicairkan setiap bulan.", meta: "", linkLabel: "", linkHref: "", highlighted: true },
      ],
    }),
    block("FAQ", {
      eyebrow: "Pertanyaan",
      heading: "Tentang program mitra",
      layout: "two-column",
      items: [
        { question: "Apakah ada biaya pendaftaran?", answer: "Tidak ada. Mendaftar dan menjadi mitra sepenuhnya gratis.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: true },
        { question: "Kapan komisi dibayarkan?", answer: "Setiap tanggal 10 untuk komisi bulan sebelumnya, setelah melewati masa pengembalian barang.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Harus punya banyak pengikut?", answer: "Tidak. Banyak mitra kami mulai dari grup WhatsApp keluarga dan teman.", category: "", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),
    block("CTA", {
      heading: "Tautan pertamamu bisa aktif hari ini.",
      description: "Daftar sekarang, gratis.",
      buttonLabel: "Daftar Jadi Mitra",
      buttonHref: "/affiliate",
      secondaryLabel: "Tanya dulu",
      secondaryHref: WA,
      layout: "card",
      tone: "accent",
    }),
    footer("Mitra Cuan", "Program afiliasi untuk semua orang."),
  ]);
}

export function createUseCaseTemplateBlocks(id: UseCaseTemplateId): BlockInput[] {
  switch (id) {
    case "kopi-senja-umkm":
      return kopiSenja();
    case "dapur-rumahan-ebook":
      return dapurRumahan();
    case "salon-ayu-jasa":
      return salonAyu();
    case "kelas-cuan-webinar":
      return kelasCuan();
    case "link-in-bio-kreator":
      return linkInBio();
    case "ruang-tumbuh-membership":
      return ruangTumbuh();
    case "mitra-cuan-afiliasi":
      return mitraCuan();
  }
}
