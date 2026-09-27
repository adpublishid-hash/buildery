import type {
  BlockDataMap,
  BlockInput,
  BlockType,
} from "./schema";
import { parseBlockData } from "./schema";
import {
  resolveBlockAnimation,
  type AnimationPreset,
  type BlockAnimation,
} from "./animation";
import {
  USE_CASE_TEMPLATES,
  createUseCaseTemplateBlocks,
  type UseCaseTemplateId,
} from "./templates-usecase";

const LEGACY_TEMPLATES = [
  {
    id: "soleva-aida-shoes",
    name: "Soleva — Shoe Launch",
    category: "High Conversion",
    description:
      "Landing page penjualan sepatu lengkap dengan copywriting AIDA, social proof, penawaran, FAQ, dan CTA.",
    blockCount: 14,
    previewImage:
      "/templates/1542291026-7eec264c27ff-406d16d3.jpg",
    previewEyebrow: "SOLEVA · Performance Footwear",
    previewHeading: "MOVE LIGHT. GO FURTHER.",
    accentColor: "#f97316",
    sourceLabel: "AIDA eCommerce original",
    highlights: [
      "Header & Hero",
      "Problem & Benefits",
      "Product Gallery",
      "Comparison & Reviews",
      "Offer & Guarantee",
      "Urgency, FAQ & CTA",
    ],
  },
  {
    id: "fluentlab-english-class",
    name: "FluentLab — Kelas Inggris Online",
    category: "Online Course",
    description:
      "Landing page AIDA untuk kelas Bahasa Inggris online, lengkap dengan kurikulum, mentor, social proof, harga, garansi, FAQ, dan motion animation.",
    blockCount: 17,
    previewImage:
      "/templates/1523240795612-9a054b0db6-9ea89df5.jpg",
    previewEyebrow: "FLUENTLAB · Live English Class",
    previewHeading: "SPEAK WITH CONFIDENCE.",
    accentColor: "#2563eb",
    sourceLabel: "AIDA online course original",
    highlights: [
      "Hero & Social Proof",
      "Problem & Solution",
      "Metode & Kurikulum",
      "Profil Mentor",
      "Harga & Garansi",
      "Urgency, FAQ & CTA",
    ],
  },
  {
    id: "atlas-executive-cv",
    name: "Atlas — Executive CV",
    category: "Professional CV",
    description:
      "CV satu kolom yang bersih dan ATS-friendly untuk profesional, lengkap dengan summary, pengalaman, pendidikan, proyek, dan skill.",
    blockCount: 8,
    previewImage:
      "/templates/1500648767791-00dcc994a4-8adfb495.jpg",
    previewEyebrow: "RESUME · PROJECT LEAD",
    previewHeading: "CLEAR. CREDIBLE. READY.",
    accentColor: "#0f172a",
    sourceLabel: "minimal professional CV",
    highlights: [
      "ATS-friendly layout",
      "Professional summary",
      "Experience timeline",
      "Education cards",
      "Selected projects",
      "Skills & contact CTA",
    ],
  },
  {
    id: "jason-creator-portfolio",
    name: "Jason — Creator Portfolio",
    category: "Digital Portfolio",
    description:
      "Portfolio modern untuk freelancer dan creator dengan hero personal, skills, projects, services, contact form, FAQ, dan motion.",
    blockCount: 10,
    previewImage:
      "/templates/1534528741775-53994a69da-5ada364c.jpg",
    previewEyebrow: "PORTFOLIO · NO-CODE CREATOR",
    previewHeading: "BUILD WITH CLARITY.",
    accentColor: "#111827",
    sourceLabel: "creator portfolio workspace",
    highlights: [
      "Personal hero",
      "Skill cloud",
      "Project showcase",
      "Service packages",
      "Contact form",
      "FAQ & final CTA",
    ],
  },
  {
    id: "maison-editorial-cv",
    name: "Maison — Editorial CV",
    category: "Editorial CV",
    description:
      "CV portfolio editorial yang elegan dengan portrait summary, pengalaman, campaign pilihan, client proof, contact, dan motion halus.",
    blockCount: 10,
    previewImage:
      "/templates/1494790108377-be9c29b293-cd4178b6.jpg",
    previewEyebrow: "EDITORIAL · BRAND CONSULTANT",
    previewHeading: "STORIES WITH PURPOSE.",
    accentColor: "#57534e",
    sourceLabel: "elegant editorial portfolio",
    highlights: [
      "Editorial portrait",
      "Career timeline",
      "Selected campaigns",
      "Education & awards",
      "Client references",
      "Contact & availability",
    ],
  },
  {
    id: "albert-video-producer",
    name: "Albert — Video Producer",
    category: "Media Portfolio",
    description:
      "Portfolio hitam-putih untuk video producer dengan brand trust, statistik, skill matrix, projects, achievements, testimonial, dan CTA konsultasi.",
    blockCount: 10,
    previewImage:
      "/templates/1485846234645-a62644f847-07192b1f.jpg",
    previewEyebrow: "VIDEO PRODUCER · CORPORATE MEDIA",
    previewHeading: "FRAME THE RIGHT STORY.",
    accentColor: "#f97316",
    sourceLabel: "video producer portfolio",
    highlights: ["Profile hero", "Brand trust", "Impact metrics", "Skill matrix", "Project gallery", "Awards & testimonials"],
  },
  {
    id: "albert-notion-consultant",
    name: "Albert — Notion Consultant",
    category: "Consultant Portfolio",
    description:
      "Portfolio specialist Notion dengan profile card, contact grid, services, systems showcase, education, achievements, dan social links.",
    blockCount: 9,
    previewImage:
      "/templates/1497215728101-856f4ea421-2191ee0f.jpg",
    previewEyebrow: "NOTION AMBASSADOR · SYSTEM DESIGN",
    previewHeading: "WORKSPACES THAT WORK.",
    accentColor: "#111827",
    sourceLabel: "Notion consultant profile",
    highlights: ["Profile & contact", "Service cards", "System projects", "Skill matrix", "Achievements", "Education & CTA"],
  },
  {
    id: "albert-creative-resume",
    name: "Albert — Creative Resume",
    category: "Creative CV",
    description:
      "CV portfolio modular untuk creative technologist dengan statistik, tools, pengalaman, achievement, testimonial, dan contact form.",
    blockCount: 9,
    previewImage:
      "/templates/1516321318423-f06f85e504-77bd8bf8.jpg",
    previewEyebrow: "CREATIVE TECHNOLOGIST · AUTOMATION",
    previewHeading: "MAKE IDEAS USEFUL.",
    accentColor: "#ea580c",
    sourceLabel: "modular creative resume",
    highlights: ["Split hero", "Career metrics", "Tools & skills", "Experience", "Achievements", "Contact form & motion"],
  },
] as const;

/**
 * Template untuk use case yang dijual tampil lebih dulu; CV dan portofolio
 * tetap tersedia di bawahnya.
 */
export const BUILDER_TEMPLATES = [...USE_CASE_TEMPLATES, ...LEGACY_TEMPLATES] as const;

export type BuilderTemplateId = (typeof BUILDER_TEMPLATES)[number]["id"];

function block<T extends BlockType>(
  type: T,
  data: Partial<BlockDataMap[T]>
) {
  return {
    type,
    data: parseBlockData(type, data),
  } as unknown as Extract<BlockInput, { type: T }>;
}

type TemplateMotion = Partial<Omit<BlockAnimation, "preset">> & {
  preset: AnimationPreset;
};

function animateBlocks(
  blocks: BlockInput[],
  plan: TemplateMotion[]
): BlockInput[] {
  return blocks.map((item, index) => ({
    ...item,
    data: {
      ...item.data,
      motion: resolveBlockAnimation(plan[index] ?? {}),
    },
  })) as BlockInput[];
}

export function createTemplateBlocks(id: BuilderTemplateId): BlockInput[] {
  switch (id) {
    case "soleva-aida-shoes":
      return createSolevaAidaBlocks();
    case "fluentlab-english-class":
      return createFluentLabEnglishBlocks();
    case "atlas-executive-cv":
      return createAtlasExecutiveCvBlocks();
    case "jason-creator-portfolio":
      return createJasonCreatorPortfolioBlocks();
    case "maison-editorial-cv":
      return createMaisonEditorialCvBlocks();
    case "albert-video-producer":
      return createAlbertVideoProducerBlocks();
    case "albert-notion-consultant":
      return createAlbertNotionConsultantBlocks();
    case "albert-creative-resume":
      return createAlbertCreativeResumeBlocks();
    default:
      return createUseCaseTemplateBlocks(id as UseCaseTemplateId);
  }
}

function createSolevaAidaBlocks(): BlockInput[] {
  const countdownTarget = new Date(
    Date.now() + (3 * 24 + 8) * 60 * 60 * 1000
  ).toISOString();

  return animateBlocks([
    // â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("HEADER", {
      logoText: "SOLEVA",
      tagline: "Move light. Go further.",
      primaryLabel: "Belanja Sekarang",
      primaryHref: "/products",
      secondaryLabel: "",
      secondaryHref: "#",
      layout: "split",
      tone: "light",
      width: "wide",
      buttonStyle: "solid",
      sticky: true,
      mobileMenu: true,
      showLogo: true,
      showNav: true,
      showCta: true,
      navItems: [
        { label: "Keunggulan", href: "#keunggulan", description: "Teknologi di setiap langkah", badge: "" },
        { label: "Review", href: "#review", description: "Dari pembeli terverifikasi", badge: "4.9/5" },
        { label: "Penawaran", href: "#penawaran", description: "Harga peluncuran terbatas", badge: "Hemat 25%" },
        { label: "FAQ", href: "#faq", description: "Ukuran, garansi, pengiriman", badge: "" },
      ],
    }),

    // â”€â”€ HERO — ATTENTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("HERO", {
      eyebrow: "Rilis Baru · Soleva Flux One",
      badge: "Gratis ongkir + tukar ukuran 30 hari",
      heading: "10.000 langkah terasa lebih ringan.",
      subheading:
        "Soleva Flux One memadukan bantalan CloudStep™, upper knit yang adem, dan grip antiselip—untuk kamu yang ingin bergerak seharian tanpa kaki cepat menyerah.",
      primaryLabel: "Dapatkan Flux One — Rp749.000",
      primaryHref: "/products",
      secondaryLabel: "Lihat Kenapa Berbeda",
      secondaryHref: "#keunggulan",
      mediaUrl:
        "/templates/1542291026-7eec264c27ff-5741fa68.jpg",
      mediaAlt: "Soleva Flux One warna merah untuk aktivitas harian",
      mediaCaption: "Flux One · Ember Red",
      trustText: "★ 4,9/5 dari 1.284 pembeli terverifikasi",
      stats: [
        { value: "280 g", label: "Ringan di kaki" },
        { value: "12 jam", label: "Nyaman dipakai" },
        { value: "30 hari", label: "Tukar ukuran" },
      ],
      layout: "split",
      height: "full",
      buttonStyle: "solid",
      buttonColor: "#f97316",
      buttonTextColor: "#ffffff",
      mediaPosition: "right",
      overlay: "none",
      align: "left",
    }),

    // â”€â”€ MARQUEE — Trust Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€─
    block("MARQUEE", {
      eyebrow: "",
      heading: "",
      subheading: "",
      direction: "left",
      speed: "normal",
      separator: "dot",
      size: "md",
      tone: "dark",
      pauseOnHover: true,
      align: "center",
      items: [
        { text: "Gratis Ongkir Se-Indonesia", icon: "🚚", href: "" },
        { text: "Tukar Ukuran 30 Hari", icon: "↔", href: "" },
        { text: "Pembayaran 100% Aman", icon: "🔒", href: "" },
        { text: "Garansi Produk 90 Hari", icon: "✓", href: "" },
        { text: "4,9/5 dari 1.284 Pembeli", icon: "★", href: "#review" },
        { text: "CloudStep™ Technology", icon: "☁", href: "#keunggulan" },
      ],
    }),

    // â”€â”€ TEXT — INTEREST: Agitate the pain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€─
    block("TEXT", {
      eyebrow: "Masalahnya bukan langkahmu",
      heading: "Kalau baru siang kaki sudah minta pulang, mungkin sepatumu yang menahanmu.",
      subheading:
        "Sol yang terlalu keras, ruang jari sempit, dan material panas membuat langkah kecil terasa seperti pekerjaan besar.",
      body:
        "<p><strong>Flux One dirancang dari bawah ke atas untuk ritme harianmu.</strong> Midsole CloudStep™ menyerap benturan tanpa terasa amblas, toe box memberi ruang alami untuk jari, dan upper knit membantu panas keluar saat aktivitas meningkat.</p><p>Hasilnya: langkah yang stabil sejak perjalanan pagi, meeting siang, sampai nongkrong malam—tanpa perlu ganti sepatu.</p>",
      buttonLabel: "Temukan Teknologi Flux One",
      buttonHref: "#keunggulan",
      attribution: "Nyaman bukan bonus. Nyaman adalah standar.",
      imageUrl:
        "/templates/1549298916-b41d501d3772-d2b7e5fd.jpg",
      imageAlt: "Detail sepatu kasual dengan konstruksi ringan",
      imagePosition: "left",
      layout: "split",
      tone: "accent",
      align: "left",
    }),

    // â”€â”€ FEATURE GRID — INTEREST: Mechanism â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("FEATURE_GRID", {
      eyebrow: "Kenapa Flux One berbeda",
      heading: "Enam detail kecil. Satu perubahan besar di setiap langkah.",
      subheading:
        "Setiap komponen punya fungsi jelas—lebih nyaman, stabil, dan mudah dipakai setiap hari.",
      columns: 3,
      layout: "cards",
      cardStyle: "elevated",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "01", icon: "☁", title: "CloudStep™ Cushion", description: "Bantalan responsif yang menyerap benturan dan mengembalikan energi di setiap langkah berikutnya.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "02", icon: "💨", title: "AirKnit 360°", description: "Upper rajutan berpori menjaga kaki tetap adem bahkan setelah berjam-jam beraktivitas.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "03", icon: "↔", title: "Natural Toe Room", description: "Toe box lebih lega memberi ruang alami untuk jari—tidak sempit, tidak kebas.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "04", icon: "⬡", title: "GripCore Outsole", description: "Pola grip multidirectional menjaga pijakan tetap stabil di lantai licin dan jalan basah.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "05", icon: "⚖", title: "Ultra-light 280g", description: "Bobot setara smartphone—ringan di kaki tanpa mengorbankan durabilitas.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "06", icon: "♻", title: "Built to Last", description: "Material pilihan dan jahitan diperkuat untuk menemani rutinmu lebih lama.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),

    // â”€â”€ GALLERY — Visual proof â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("GALLERY", {
      eyebrow: "Dibuat untuk dilihat. Dirancang untuk dipakai.",
      heading: "Satu siluet, banyak cerita harian.",
      subheading: "Lihat detail material dan pilihan warna Flux One dari dekat.",
      layout: "featured",
      columns: 3,
      gap: "sm",
      aspectRatio: "square",
      frame: "rounded",
      captionPosition: "overlay",
      hoverEffect: "zoom",
      lightbox: true,
      align: "left",
      items: [
        { url: "/templates/1542291026-7eec264c27ff-ca611b35.jpg", alt: "Flux One Ember Red", title: "Ember Red", caption: "Warna signature yang berani tanpa berisik", href: "/products", featured: true },
        { url: "/templates/1600185365483-26d7a4cc75-fbdd789a.jpg", alt: "Flux One Sand Stone", title: "Sand Stone", caption: "Netral untuk setiap kombinasi outfit", href: "/products", featured: false },
        { url: "/templates/1600269452121-4f2416e55c-7da8fe94.jpg", alt: "Flux One Cloud White", title: "Cloud White", caption: "Bersih, serbaguna, dan timeless", href: "/products", featured: false },
        { url: "/templates/1495555961986-6d4c1ecb7b-2ae42330.jpg", alt: "Flux One untuk aktivitas harian", title: "City Ready", caption: "Dari commute pagi sampai weekend adventure", href: "/products", featured: false },
      ],
    }),

    // â”€â”€ COMPARISON TABLE — DESIRE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€─
    block("COMPARISON_TABLE", {
      eyebrow: "Bandingkan sebelum melangkah",
      heading: "Sepatu harian seharusnya bekerja sekeras kamu.",
      subheading:
        "Lihat apa yang kamu dapatkan saat beralih dari sepatu biasa ke Flux One.",
      layout: "table",
      tone: "soft",
      showCta: true,
      align: "center",
      columns: [
        { name: "Sepatu Biasa", description: "Cukup untuk sesekali", badge: "", ctaLabel: "", ctaHref: "#", highlighted: false },
        { name: "Soleva Flux One", description: "Siap untuk setiap hari", badge: "Pilihan Lebih Baik", ctaLabel: "Pilih Flux One", ctaHref: "/products", highlighted: true },
      ],
      rows: [
        { feature: "Bantalan responsif", description: "Mengurangi benturan saat berjalan", values: ["Standar", "CloudStep™"] },
        { feature: "Sirkulasi udara", description: "Membantu kaki tetap adem", values: ["Terbatas", "AirKnit 360°"] },
        { feature: "Ruang jari", description: "Gerak kaki lebih alami", values: ["Sempit", "Lebih lega"] },
        { feature: "Bobot per sepatu", description: "Mengurangi beban langkah", values: ["350–450 g", "280 g"] },
        { feature: "Grip antiselip", description: "Pijakan stabil di segala medan", values: ["Dasar", "GripCore"] },
        { feature: "Jaminan pembelian", description: "Belanja tanpa khawatir", values: ["Bervariasi", "Tukar 30 hari + Garansi 90 hari"] },
      ],
    }),

    // â”€â”€ TESTIMONIAL — Social proof â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("TESTIMONIAL", {
      eyebrow: "Dipakai. Diuji. Direkomendasikan.",
      heading: "Ribuan langkah, cerita yang sama: nyaman sampai pulang.",
      subheading: "Ulasan dari pembeli terverifikasi Flux One.",
      quote: "",
      authorName: "",
      authorRole: "",
      avatarUrl: "",
      logoUrl: "",
      rating: 5,
      layout: "grid",
      tone: "soft",
      columns: 3,
      align: "left",
      showQuotes: true,
      items: [
        { quote: "Biasanya jam tiga sore telapak kaki sudah pegal. Pakai Flux One, saya masih nyaman lanjut commute dan belanja setelah kerja. Ini sepatu pertama yang benar-benar saya pakai setiap hari.", authorName: "Nadia P.", authorRole: "Product Designer · Jakarta", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "Ringan, tapi tidak terasa tipis. Grip-nya paling terasa saat stasiun basah setelah hujan. Ukurannya juga sesuai panduan—tidak perlu tukar.", authorName: "Reza A.", authorRole: "Fotografer · Bandung", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
        { quote: "Saya bawa untuk trip lima hari ke Bali dan cuma pakai satu sepatu ini. Masuk ke outfit santai maupun semi-formal. CloudStep-nya game changer.", authorName: "Maya S.", authorRole: "Content Creator · Surabaya", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),

    // â”€â”€ PRICING — DESIRE: Offer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€─
    block("PRICING", {
      eyebrow: "Pilih langkah pertamamu",
      heading: "Nyaman hari ini. Hemat lebih banyak sekarang.",
      subheading:
        "Semua pembelian dilengkapi gratis ongkir, garansi 90 hari, dan tukar ukuran selama 30 hari.",
      billingNote: "Harga promo contoh dan dapat diedit dari settings block.",
      layout: "featured",
      tone: "light",
      columns: 2,
      align: "center",
      plans: [
        {
          badge: "Paling populer",
          name: "Flux One — Single Pair",
          price: "Rp749.000",
          period: "",
          description: "Satu pasang untuk upgrade langkah harianmu.",
          features: ["1 pasang Flux One", "Gratis ongkir se-Indonesia", "Tukar ukuran 30 hari", "Garansi produk 90 hari", "Support WhatsApp prioritas"],
          excludedFeatures: [],
          note: "Harga normal Rp999.000 — hemat Rp250.000",
          highlighted: true,
          ctaLabel: "Pilih Warna & Ukuran",
          ctaHref: "/products",
          secondaryLabel: "Lihat panduan ukuran",
          secondaryHref: "#faq",
        },
        {
          badge: "Best value",
          name: "Flux Duo — 2 Pairs",
          price: "Rp1.299.000",
          period: "",
          description: "Dua warna favorit atau satu pasang untuk orang tersayang.",
          features: ["2 pasang Flux One", "Hemat ekstra Rp199.000", "Gratis ongkir prioritas", "Tukar ukuran 30 hari", "Garansi produk 90 hari"],
          excludedFeatures: [],
          note: "Setara Rp649.500 per pasang",
          highlighted: false,
          ctaLabel: "Ambil Paket Duo",
          ctaHref: "/products",
          secondaryLabel: "",
          secondaryHref: "#",
        },
      ],
    }),

    // â”€â”€ TEXT — Guarantee â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("TEXT", {
      eyebrow: "Coba tanpa rasa khawatir",
      heading: "90 hari untuk membuktikan. Risiko kami yang tanggung.",
      subheading:
        "Kami yakin kenyamanan baru terasa setelah sepatu benar-benar menemani harimu.",
      body:
        "<p>Pakai Flux One dalam aktivitas harianmu. Jika ada masalah produksi dalam 90 hari, hubungi tim kami untuk proses garansi. Salah pilih ukuran? Ajukan penukaran dalam 30 hari sesuai syarat yang berlaku.</p><p><strong>Kamu cukup fokus melangkah. Kami urus sisanya.</strong></p>",
      buttonLabel: "Coba Flux One Sekarang",
      buttonHref: "/products",
      attribution: "Garansi produk 90 hari · Tukar ukuran 30 hari · Support WhatsApp",
      imageUrl:
        "/templates/1460353581641-37baddab0f-e1075874.jpg",
      imageAlt: "Sepatu nyaman untuk aktivitas sehari-hari",
      imagePosition: "right",
      layout: "split",
      tone: "bordered",
      align: "left",
    }),

    // â”€â”€ COUNTDOWN — ACTION: Urgency â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€─
    block("COUNTDOWN", {
      eyebrow: "Penawaran peluncuran terbatas",
      heading: "Hemat Rp250.000 sebelum waktu habis.",
      subheading:
        "Setelah periode promo selesai, Flux One kembali ke harga normal Rp999.000.",
      targetDate: countdownTarget,
      layout: "cards",
      tone: "dark",
      showLabels: true,
      showSeconds: true,
      expiredMessage: "Promo telah berakhir. Cek penawaran terbaru kami.",
      ctaLabel: "Kunci Harga Rp749.000",
      ctaHref: "/products",
      labelDays: "Hari",
      labelHours: "Jam",
      labelMinutes: "Menit",
      labelSeconds: "Detik",
      align: "center",
    }),

    // â”€â”€ FAQ — Objection handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("FAQ", {
      eyebrow: "Masih ingin memastikan?",
      heading: "Jawaban sebelum kamu memilih ukuran.",
      subheading: "Detail penting tentang ukuran, pengiriman, perawatan, dan garansi.",
      layout: "two-column",
      tone: "soft",
      iconStyle: "plus",
      answerStyle: "plain",
      showCategories: false,
      allowMultipleOpen: true,
      searchPlaceholder: "",
      ctaLabel: "Chat Tim Soleva",
      ctaHref: "https://wa.me/62XXXXXXXXXX",
      ctaText: "Belum menemukan jawaban? Kami siap membantu.",
      align: "left",
      items: [
        { question: "Bagaimana memilih ukuran yang tepat?", answer: "Ukur panjang kaki dalam sentimeter dan cocokkan dengan size chart. Jika berada di antara dua ukuran, pilih ukuran yang lebih besar.", category: "Ukuran", anchor: "", icon: "", highlighted: true, defaultOpen: true },
        { question: "Bisa tukar ukuran?", answer: "Bisa. Ajukan penukaran maksimal 30 hari setelah barang diterima selama produk masih sesuai ketentuan penukaran.", category: "Penukaran", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Apakah cocok untuk lari?", answer: "Flux One dirancang untuk walking, commute, traveling, dan aktivitas harian. Untuk lari intensif, gunakan sepatu running khusus.", category: "Penggunaan", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Bagaimana cara membersihkannya?", answer: "Gunakan sikat lembut, sabun ringan, dan air dingin. Hindari mesin cuci serta panas langsung.", category: "Perawatan", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Berapa lama pengiriman?", answer: "Pesanan biasanya diproses 1–2 hari kerja. Estimasi tiba bergantung kota tujuan dan ekspedisi yang dipilih.", category: "Pengiriman", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Apa yang dicakup garansi 90 hari?", answer: "Garansi mencakup cacat produksi sesuai kebijakan toko. Kerusakan akibat penggunaan yang tidak sesuai tidak termasuk.", category: "Garansi", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),

    // â”€â”€ CTA — Final push â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("CTA", {
      eyebrow: "Langkah yang lebih nyaman dimulai di sini",
      badge: "Promo Launch · Stok Terbatas",
      heading: "Besok kamu tetap akan berjalan. Buat setiap langkahnya terasa lebih ringan.",
      description:
        "Pilih warna favoritmu, temukan ukuran yang pas, dan rasakan Flux One tanpa khawatir—gratis ongkir dan bisa tukar ukuran selama 30 hari.",
      buttonLabel: "Dapatkan Flux One — Rp749.000",
      buttonHref: "/products",
      secondaryLabel: "Chat Sebelum Membeli",
      secondaryHref: "https://wa.me/62XXXXXXXXXX",
      note: "🔒 Pembayaran aman · Gratis ongkir · Garansi 90 hari",
      imageUrl:
        "/templates/1542291026-7eec264c27ff-374991a8.jpg",
      imageAlt: "Soleva Flux One Ember Red",
      layout: "background",
      tone: "dark",
      buttonStyle: "solid",
      buttonColor: "#f97316",
      buttonTextColor: "#ffffff",
      imagePosition: "right",
      height: "large",
      overlay: "dark",
      align: "left",
    }),

    // â”€â”€ FOOTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    block("FOOTER", {
      brand: "SOLEVA",
      description:
        "Performance footwear untuk langkah harian yang lebih ringan, stabil, dan percaya diri.",
      copyright: "SOLEVA Footwear. All rights reserved.",
      ctaHeading: "Butuh bantuan memilih ukuran?",
      ctaDescription: "Tim kami siap membantu sebelum kamu checkout.",
      ctaLabel: "Chat via WhatsApp",
      ctaHref: "https://wa.me/62XXXXXXXXXX",
      layout: "cta",
      tone: "dark",
      width: "full",
      showBrand: true,
      showCopyright: true,
      showSocial: true,
      navItems: [
        { label: "Katalog", href: "/products", description: "", badge: "" },
        { label: "Panduan Ukuran", href: "#faq", description: "", badge: "" },
        { label: "Pengiriman", href: "#faq", description: "", badge: "" },
        { label: "Garansi", href: "#faq", description: "", badge: "" },
      ],
      socialItems: [
        { label: "Instagram", href: "https://instagram.com", description: "", badge: "" },
        { label: "TikTok", href: "https://tiktok.com", description: "", badge: "" },
        { label: "WhatsApp", href: "https://wa.me/62XXXXXXXXXX", description: "", badge: "" },
      ],
    }),
  ], [
    // Header — subtle fade on load
    { preset: "fade", duration: 0.3, distance: 0, trigger: "load" },
    // Hero — dramatic reveal with parallax float
    { preset: "reveal-up", duration: 0.85, distance: 48, easing: "smooth", parallax: 20, hover: "lift", loop: "float" },
    // Marquee — fade with scroll-linked opacity
    { preset: "fade", duration: 0.4, distance: 0, scrollFade: true },
    // Text (Problem) — slide from right with glow on hover
    { preset: "fade-right", duration: 0.7, distance: 50, easing: "smooth", parallax: 16, hover: "glow" },
    // Feature Grid — 3D flip entrance with spring bounce
    { preset: "flip-up", duration: 0.75, distance: 0, easing: "spring", hover: "lift" },
    // Gallery — zoom in with parallax and grow on hover
    { preset: "zoom-in", duration: 0.7, distance: 0, easing: "smooth", parallax: 12, hover: "grow" },
    // Comparison — slide from left with lift hover
    { preset: "fade-left", duration: 0.7, distance: 46, easing: "ease-out", hover: "lift" },
    // Testimonial — blur entrance with subtle breathing loop
    { preset: "blur-in", duration: 0.65, distance: 0, easing: "smooth", hover: "glow", loop: "breathe" },
    // Pricing — pop with bounce physics
    { preset: "pop", duration: 0.6, distance: 0, easing: "bounce", hover: "lift" },
    // Guarantee — rotate entrance with tilt hover
    { preset: "rotate-in", duration: 0.65, distance: 0, easing: "smooth", hover: "tilt" },
    // Countdown — zoom with pulsing loop
    { preset: "zoom-in", duration: 0.6, distance: 0, easing: "ease-out", loop: "pulse", scrollFade: true },
    // FAQ — fade up with parallax and lift
    { preset: "fade-up", duration: 0.6, distance: 32, easing: "smooth", parallax: 8, hover: "lift" },
    // CTA — dramatic reveal with parallax float and glow
    { preset: "reveal-up", duration: 0.85, distance: 48, easing: "smooth", parallax: 22, hover: "glow", loop: "float" },
    // Footer — gentle fade with scroll-linked opacity
    { preset: "fade", duration: 0.5, distance: 0, scrollFade: true },
  ]);
}
function createFluentLabEnglishBlocks(): BlockInput[] {
  const enrollmentDeadline = new Date(
    Date.now() + (4 * 24 + 10) * 60 * 60 * 1000
  ).toISOString();

  return animateBlocks([
    block("HEADER", {
      logoText: "FLUENTLAB",
      tagline: "English for real conversations",
      primaryLabel: "Ikut Kelas",
      primaryHref: "#harga",
      secondaryLabel: "",
      secondaryHref: "#",
      layout: "split",
      tone: "light",
      width: "wide",
      buttonStyle: "solid",
      sticky: true,
      mobileMenu: true,
      showLogo: true,
      showNav: true,
      showCta: true,
      navItems: [
        { label: "Metode", href: "#metode", description: "FluentLoop speaking system", badge: "" },
        { label: "Kurikulum", href: "#kurikulum", description: "8 minggu terstruktur", badge: "8 minggu" },
        { label: "Testimoni", href: "#testimoni", description: "Dari alumni terverifikasi", badge: "4.9/5" },
        { label: "FAQ", href: "#faq", description: "Jadwal, level, garansi", badge: "" },
      ],
    }),

    // ATTENTION: a specific transformation for busy adult learners.
    block("HERO", {
      eyebrow: "Kelas Online Live · Batch Baru Dibuka",
      badge: "Maksimal 12 siswa per kelas",
      heading: "Berhenti menerjemahkan di kepala. Mulai bicara Bahasa Inggris dengan percaya diri.",
      subheading:
        "English Sprint membantu profesional sibuk membangun speaking habit dalam 8 minggu melalui live class, praktik kelompok kecil, dan feedback personal—tanpa harus menghafal grammar berjam-jam.",
      primaryLabel: "Amankan Kursi Saya",
      primaryHref: "#harga",
      secondaryLabel: "Lihat Cara Belajarnya",
      secondaryHref: "#metode",
      mediaUrl:
        "/templates/1523240795612-9a054b0db6-80a98a01.jpg",
      mediaAlt: "Siswa kelas Bahasa Inggris online sedang belajar bersama",
      mediaCaption: "Live, interaktif, dan fokus praktik",
      trustText: "★ 4,9/5 dari 680+ alumni · Kelas malam & akhir pekan",
      stats: [
        { value: "8 minggu", label: "Program intensif" },
        { value: "3x/minggu", label: "Speaking practice" },
        { value: "12 siswa", label: "Kelas kecil" },
      ],
      layout: "split",
      height: "full",
      buttonStyle: "solid",
      buttonColor: "#2563eb",
      buttonTextColor: "#ffffff",
      mediaPosition: "right",
      overlay: "none",
      align: "left",
    }),

    block("MARQUEE", {
      direction: "left",
      speed: "normal",
      separator: "dot",
      size: "md",
      tone: "dark",
      pauseOnHover: true,
      align: "center",
      items: [
        { text: "Live Class Interaktif", icon: "●", href: "#metode" },
        { text: "Feedback Personal", icon: "✓", href: "#metode" },
        { text: "Rekaman Seumur Program", icon: "▶", href: "#kurikulum" },
        { text: "Komunitas Speaking", icon: "◎", href: "#testimoni" },
        { text: "Garansi 7 Hari", icon: "◇", href: "#garansi" },
      ],
    }),

    block("STATS", {
      eyebrow: "Belajar dengan target yang terukur",
      heading: "Bukan sekadar paham. Kamu dilatih sampai berani bicara.",
      subheading: "Angka berikut adalah contoh social proof yang bisa kamu edit sesuai data programmu.",
      layout: "strip",
      tone: "soft",
      columns: 4,
      align: "center",
      items: [
        { icon: "★", value: "4,9/5", label: "Rating alumni", description: "Dari survei akhir program", trend: "+0,3", highlighted: true },
        { icon: "◉", value: "680+", label: "Alumni belajar", description: "Profesional dan mahasiswa", trend: "", highlighted: false },
        { icon: "↑", value: "87%", label: "Lebih percaya diri", description: "Saat presentasi dan meeting", trend: "+21%", highlighted: false },
        { icon: "✓", value: "92%", label: "Kelas diselesaikan", description: "Dengan accountability system", trend: "", highlighted: false },
      ],
    }),

    // INTEREST: name the real friction before presenting the mechanism.
    block("TEXT", {
      eyebrow: "Kamu sebenarnya sudah tahu banyak",
      heading: "Masalahnya bukan kurang vocabulary. Masalahnya kamu jarang diberi ruang aman untuk memakainya.",
      subheading:
        "Video dan aplikasi bisa menambah pengetahuan, tetapi kelancaran hanya tumbuh ketika kamu berbicara, salah, mendapat koreksi, lalu mencoba lagi.",
      body:
        "<p>Mungkin kamu bisa memahami email dan film berbahasa Inggris, tetapi mendadak blank saat meeting, interview, atau ngobrol dengan orang asing. Kamu menyusun kalimat terlalu lama karena takut grammar salah dan takut terdengar aneh.</p><p><strong>FluentLab mengubah belajar pasif menjadi latihan aktif.</strong> Setiap sesi dirancang agar kamu bicara lebih banyak daripada tutor, dengan topik yang dekat dengan pekerjaan dan kehidupan sehari-hari.</p>",
      buttonLabel: "Lihat Metode FluentLoop",
      buttonHref: "#metode",
      attribution: "Confidence comes from repetition, not perfection.",
      imageUrl:
        "/templates/1546410531-bb4caa6b424d-6b5b172d.jpg",
      imageAlt: "Peserta berlatih percakapan Bahasa Inggris",
      imagePosition: "left",
      layout: "split",
      tone: "accent",
      align: "left",
    }),

    block("FEATURE_GRID", {
      eyebrow: "Kenapa FluentLab bekerja",
      heading: "Sistem belajar yang membuatmu konsisten bicara, bukan sibuk mengoleksi materi.",
      subheading: "Setiap fitur menghilangkan satu hambatan utama dalam membangun speaking confidence.",
      columns: 3,
      layout: "cards",
      cardStyle: "elevated",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "PRACTICE", icon: "◎", title: "70% Speaking Time", description: "Sesi didominasi role-play, discussion, dan simulasi situasi nyata.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "FEEDBACK", icon: "✓", title: "Koreksi yang Bisa Dipakai", description: "Tutor memberi catatan pronunciation, grammar, dan pilihan kata tanpa memotong keberanianmu.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "HABIT", icon: "↗", title: "Daily Micro Practice", description: "Latihan 15 menit menjaga momentum bahkan di hari kerja yang padat.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "REAL WORLD", icon: "◇", title: "Topik Kehidupan Nyata", description: "Meeting, interview, travel, networking, dan small talk—bukan dialog buku teks.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "COMMUNITY", icon: "●", title: "Speaking Partner", description: "Berlatih bersama partner level setara agar tidak belajar sendirian.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "PROGRESS", icon: "▣", title: "Personal Progress Map", description: "Pantau kebiasaan, kekuatan, dan area yang perlu diperbaiki setiap minggu.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),

    block("STEPS", {
      eyebrow: "Metode FluentLoop",
      heading: "Satu siklus sederhana yang diulang sampai bicara terasa alami.",
      subheading: "Kamu tidak dituntut sempurna. Kamu dibimbing untuk terus melakukan progres yang terlihat.",
      layout: "cards",
      tone: "light",
      columns: 4,
      align: "left",
      markerStyle: "number",
      items: [
        { eyebrow: "Sebelum kelas", icon: "", title: "Input", description: "Pelajari vocabulary dan contoh kalimat inti selama 15 menit.", meta: "15 menit", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "Live class", icon: "", title: "Practice", description: "Gunakan materi dalam role-play dan diskusi kelompok kecil.", meta: "75 menit", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "Setelah kelas", icon: "", title: "Feedback", description: "Terima koreksi personal dan contoh kalimat yang lebih natural.", meta: "Personal", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "Sepanjang minggu", icon: "", title: "Repeat", description: "Ulangi lewat voice note dan speaking challenge bersama partner.", meta: "3x praktik", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),

    block("COLUMNS", {
      heading: "Kurikulum 8 minggu untuk percakapan yang benar-benar kamu butuhkan.",
      subheading: "Materi disusun bertahap dari membangun spontanitas sampai menyampaikan ide dengan jelas.",
      columns: 4,
      gap: "md",
      align: "left",
      layout: "numbered",
      cardStyle: "outline",
      verticalAlign: "stretch",
      items: [
        { eyebrow: "MINGGU 1–2", icon: "", imageUrl: "", imageAlt: "", heading: "Break the Silence", body: "<p>Small talk, self-introduction, pronunciation reset, dan strategi tetap bicara saat lupa kata.</p>", meta: "Foundation", buttonLabel: "", buttonHref: "#", highlighted: false },
        { eyebrow: "MINGGU 3–4", icon: "", imageUrl: "", imageAlt: "", heading: "Daily Confidence", body: "<p>Menceritakan pengalaman, memberi opini, bertanya balik, dan menjaga percakapan tetap mengalir.</p>", meta: "Conversation", buttonLabel: "", buttonHref: "#", highlighted: true },
        { eyebrow: "MINGGU 5–6", icon: "", imageUrl: "", imageAlt: "", heading: "English at Work", body: "<p>Meeting, presentasi singkat, interview, networking, dan menanggapi ide secara profesional.</p>", meta: "Professional", buttonLabel: "", buttonHref: "#", highlighted: false },
        { eyebrow: "MINGGU 7–8", icon: "", imageUrl: "", imageAlt: "", heading: "Speak Independently", body: "<p>Storytelling, persuasive speaking, final presentation, dan personal plan setelah program selesai.</p>", meta: "Fluency", buttonLabel: "", buttonHref: "#", highlighted: false },
      ],
    }),

    block("IMAGE", {
      url: "/templates/1509062522246-3755977927-65997bd2.jpg",
      alt: "Suasana kelas Bahasa Inggris yang interaktif",
      eyebrow: "Belajar terasa hidup",
      title: "Kelas kecil membuat setiap siswa punya ruang untuk bicara.",
      description: "Gunakan gambar ini untuk menunjukkan suasana kelas, komunitas, atau cuplikan platform belajar.",
      caption: "Live class · breakout practice · personal feedback",
      linkHref: "",
      width: "wide",
      aspectRatio: "wide",
      objectFit: "cover",
      frame: "browser",
      captionPosition: "overlay",
      align: "center",
      rounded: true,
      lightbox: true,
    }),

    block("TEXT", {
      eyebrow: "Mentormu juga pernah takut bicara",
      heading: "Belajar bersama tutor yang memahami proses, bukan hanya menguasai teori.",
      subheading: "Contoh profil mentor—ganti nama, foto, dan kredensial sesuai pengajar di programmu.",
      body:
        "<p><strong>Hi, saya Maya.</strong> Selama 8 tahun saya membantu profesional Indonesia menggunakan Bahasa Inggris untuk interview, presentasi, dan kolaborasi global.</p><p>Di FluentLab, tugas saya bukan membuatmu kagum dengan aksen saya. Tugas saya adalah membuatmu lebih sering bicara, membantu saat kamu tersendat, dan menunjukkan progres yang mungkin tidak kamu sadari.</p>",
      buttonLabel: "Kenali Metode Mengajar",
      buttonHref: "#metode",
      attribution: "Maya Pratama · Lead Speaking Coach",
      imageUrl:
        "/templates/1494790108377-be9c29b293-2bea34cc.jpg",
      imageAlt: "Contoh foto mentor kelas Bahasa Inggris",
      imagePosition: "right",
      layout: "split",
      tone: "bordered",
      align: "left",
    }),

    // DESIRE: show the learner's future through relatable proof.
    block("TESTIMONIAL", {
      eyebrow: "Dari ragu menjadi berani bicara",
      heading: "Perubahan kecil yang terasa besar di meeting berikutnya.",
      subheading: "Testimoni berikut adalah contoh copy yang bisa diganti dengan cerita alumni asli.",
      quote: "",
      authorName: "",
      authorRole: "",
      avatarUrl: "",
      logoUrl: "",
      rating: 5,
      layout: "grid",
      tone: "soft",
      columns: 3,
      align: "left",
      showQuotes: true,
      items: [
        { quote: "Dulu saya selalu mute saat meeting regional. Minggu keempat saya sudah berani menjelaskan update tanpa menulis script lengkap.", authorName: "Rani A.", authorRole: "Product Manager · Jakarta", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "Feedback pronunciation-nya spesifik dan tidak menghakimi. Saya akhirnya tahu apa yang harus dilatih, bukan sekadar merasa kurang bagus.", authorName: "Dimas K.", authorRole: "Software Engineer · Bandung", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
        { quote: "Jadwal malamnya cocok untuk pekerja. Speaking partner membuat saya tetap latihan bahkan ketika minggu sedang sibuk.", authorName: "Nabila S.", authorRole: "Marketing Specialist · Surabaya", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),

    block("PRICING", {
      eyebrow: "Pilih cara belajarmu",
      heading: "Investasi untuk suara yang lebih percaya diri.",
      subheading: "Mulai dari kelas inti atau pilih paket plus jika kamu membutuhkan coaching lebih personal.",
      billingNote: "Harga dan fasilitas berikut adalah contoh yang bisa diedit dari settings block.",
      layout: "featured",
      tone: "light",
      columns: 2,
      align: "center",
      plans: [
        {
          badge: "Paling populer",
          name: "English Sprint",
          price: "Rp1.499.000",
          period: "/8 minggu",
          description: "Program lengkap untuk membangun speaking habit bersama kelas kecil.",
          features: ["16 live class", "24 speaking challenge", "Feedback mingguan", "Rekaman selama program", "Komunitas alumni 3 bulan"],
          excludedFeatures: ["Private coaching 1-on-1"],
          note: "Bisa dicicil 2x tanpa biaya tambahan",
          highlighted: true,
          ctaLabel: "Pilih English Sprint",
          ctaHref: "/courses",
          secondaryLabel: "Lihat kurikulum",
          secondaryHref: "#kurikulum",
        },
        {
          badge: "Personal support",
          name: "Sprint Plus",
          price: "Rp2.299.000",
          period: "/8 minggu",
          description: "Semua fasilitas Sprint dengan tambahan coaching personal.",
          features: ["Semua fasilitas English Sprint", "2 sesi private coaching", "Personal pronunciation plan", "Review presentasi atau interview", "Priority feedback"],
          excludedFeatures: [],
          note: "Terbatas 8 siswa setiap batch",
          highlighted: false,
          ctaLabel: "Pilih Sprint Plus",
          ctaHref: "/courses",
          secondaryLabel: "Tanya admin",
          secondaryHref: "https://wa.me/62XXXXXXXXXX",
        },
      ],
    }),

    block("TEXT", {
      eyebrow: "Mulai tanpa rasa takut salah pilih",
      heading: "Ikuti kelas selama 7 hari. Pastikan ritmenya cocok untukmu.",
      subheading: "Keputusan belajar seharusnya terasa aman dan transparan.",
      body:
        "<p>Masuk ke onboarding, ikuti sesi awal, dan rasakan sistem belajarnya. Jika dalam 7 hari pertama kamu merasa program ini tidak sesuai, hubungi tim kami sesuai syarat garansi yang berlaku.</p><p><strong>Yang kami inginkan bukan sekadar pendaftaran—kami ingin kamu benar-benar menyelesaikan program dan berani menggunakan Bahasa Inggris.</strong></p>",
      buttonLabel: "Mulai dengan Garansi 7 Hari",
      buttonHref: "#harga",
      attribution: "Garansi kepuasan 7 hari · Jadwal pengganti · Support WhatsApp",
      imageUrl:
        "/templates/1524178232363-1fb2b075b6-4bc444df.jpg",
      imageAlt: "Siswa mengikuti kelas dengan nyaman",
      imagePosition: "left",
      layout: "split",
      tone: "accent",
      align: "left",
    }),

    // ACTION: a concrete deadline before objection handling and final CTA.
    block("COUNTDOWN", {
      eyebrow: "Pendaftaran batch berikutnya",
      heading: "Harga early-bird berakhir saat waktu ini habis.",
      subheading: "Setelah periode ini, harga kembali normal dan pendaftaran ditutup ketika kelas mencapai 12 siswa.",
      targetDate: enrollmentDeadline,
      layout: "cards",
      tone: "dark",
      showLabels: true,
      showSeconds: true,
      expiredMessage: "Periode early-bird berakhir. Hubungi tim untuk ketersediaan kursi.",
      ctaLabel: "Amankan Harga Early-bird",
      ctaHref: "#harga",
      labelDays: "Hari",
      labelHours: "Jam",
      labelMinutes: "Menit",
      labelSeconds: "Detik",
      align: "center",
    }),

    block("FAQ", {
      eyebrow: "Pertanyaan sebelum mulai",
      heading: "Semua yang perlu kamu tahu sebelum masuk kelas.",
      subheading: "Edit jawaban berikut agar sesuai dengan kebijakan dan operasional kelasmu.",
      layout: "two-column",
      tone: "soft",
      iconStyle: "plus",
      answerStyle: "plain",
      showCategories: false,
      allowMultipleOpen: true,
      searchPlaceholder: "",
      ctaLabel: "Chat Tim FluentLab",
      ctaHref: "https://wa.me/62XXXXXXXXXX",
      ctaText: "Masih ragu dengan level atau jadwal? Kami siap membantu.",
      align: "left",
      items: [
        { question: "Apakah cocok untuk pemula?", answer: "Program ini cocok untuk level dasar aktif sampai menengah. Sebelum kelas, siswa mengikuti placement check agar masuk kelompok yang sesuai.", category: "Level", anchor: "", icon: "", highlighted: true, defaultOpen: true },
        { question: "Bagaimana jika saya melewatkan kelas?", answer: "Kamu mendapatkan rekaman dan materi kelas. Sesi pengganti mengikuti kebijakan serta ketersediaan jadwal program.", category: "Jadwal", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Apakah kelas benar-benar live?", answer: "Ya. Sesi utama dilakukan langsung bersama tutor dan kelompok kecil agar setiap siswa mendapat kesempatan bicara.", category: "Kelas", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Berapa lama latihan setiap minggu?", answer: "Siapkan sekitar 3–4 jam per minggu: live class, micro practice, dan speaking challenge yang dapat disesuaikan dengan jadwalmu.", category: "Waktu", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Apakah mendapat sertifikat?", answer: "Sertifikat penyelesaian diberikan kepada siswa yang memenuhi kehadiran dan tugas minimum sesuai kebijakan program.", category: "Sertifikat", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Apa yang termasuk garansi 7 hari?", answer: "Garansi mengikuti syarat program yang kamu tetapkan. Jelaskan periode pengajuan, komponen biaya, dan proses refund secara transparan.", category: "Garansi", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),

    block("CTA", {
      eyebrow: "Your voice deserves to be heard",
      badge: "Batch Terbatas · Maksimal 12 Siswa",
      heading: "Delapan minggu dari sekarang, kamu bisa tetap diam—atau mulai bicara dengan lebih percaya diri.",
      description: "Ambil langkah pertama hari ini. Ikuti placement check, pilih jadwal, dan mulai membangun speaking habit bersama lingkungan yang suportif.",
      buttonLabel: "Saya Mau Mulai Bicara",
      buttonHref: "/courses",
      secondaryLabel: "Konsultasi Level Gratis",
      secondaryHref: "https://wa.me/62XXXXXXXXXX",
      note: "✓ Placement check · Garansi 7 hari · Bisa dicicil 2x",
      imageUrl:
        "/templates/1523240795612-9a054b0db6-890c23c2.jpg",
      imageAlt: "Komunitas siswa FluentLab yang percaya diri",
      layout: "background",
      tone: "dark",
      buttonStyle: "solid",
      buttonColor: "#2563eb",
      buttonTextColor: "#ffffff",
      imagePosition: "right",
      height: "large",
      overlay: "dark",
      align: "left",
    }),

    block("FOOTER", {
      brand: "FLUENTLAB",
      description: "Kelas Bahasa Inggris online untuk percakapan nyata, karier global, dan suara yang lebih percaya diri.",
      copyright: "FluentLab English Academy. All rights reserved.",
      ctaHeading: "Belum yakin dengan levelmu?",
      ctaDescription: "Konsultasikan target dan jadwal belajarmu dengan tim kami.",
      ctaLabel: "Konsultasi Gratis",
      ctaHref: "https://wa.me/62XXXXXXXXXX",
      layout: "cta",
      tone: "dark",
      width: "full",
      showBrand: true,
      showCopyright: true,
      showSocial: true,
      navItems: [
        { label: "Metode", href: "#metode", description: "", badge: "" },
        { label: "Kurikulum", href: "#kurikulum", description: "", badge: "" },
        { label: "Harga", href: "#harga", description: "", badge: "" },
        { label: "FAQ", href: "#faq", description: "", badge: "" },
      ],
      socialItems: [
        { label: "Instagram", href: "https://instagram.com", description: "", badge: "" },
        { label: "YouTube", href: "https://youtube.com", description: "", badge: "" },
        { label: "WhatsApp", href: "https://wa.me/62XXXXXXXXXX", description: "", badge: "" },
      ],
    }),
  ], [
    // Header — instant subtle fade on load
    { preset: "fade", duration: 0.3, distance: 0, trigger: "load" },
    // Hero — dramatic reveal with floating loop and parallax
    { preset: "reveal-up", duration: 0.85, distance: 50, easing: "smooth", parallax: 18, hover: "lift", loop: "float" },
    // Marquee — fade with scroll-linked opacity
    { preset: "fade", duration: 0.4, distance: 0, scrollFade: true },
    // Stats — pop in with bounce physics
    { preset: "pop", duration: 0.6, distance: 0, easing: "bounce", hover: "grow" },
    // Text (Problem) — slide from right with glow hover and parallax
    { preset: "fade-right", duration: 0.7, distance: 50, easing: "smooth", parallax: 14, hover: "glow" },
    // Feature Grid — 3D flip entrance with spring easing and lift hover
    { preset: "flip-up", duration: 0.75, distance: 0, easing: "spring", hover: "lift" },
    // Steps — fade left with smooth parallax
    { preset: "fade-left", duration: 0.7, distance: 44, easing: "ease-out", parallax: 10, hover: "lift" },
    // Columns (Curriculum) — reveal up with parallax depth
    { preset: "reveal-up", duration: 0.75, distance: 42, easing: "smooth", parallax: 12, hover: "grow" },
    // Image — zoom in with scroll-fade and grow hover
    { preset: "zoom-in", duration: 0.7, distance: 0, easing: "smooth", hover: "grow", scrollFade: true },
    // Text (Mentor) — slide from right with tilt hover
    { preset: "fade-right", duration: 0.65, distance: 46, easing: "smooth", hover: "tilt", parallax: 8 },
    // Testimonial — blur entrance with breathing loop and glow hover
    { preset: "blur-in", duration: 0.65, distance: 0, easing: "smooth", hover: "glow", loop: "breathe" },
    // Pricing — pop with bounce and lift hover
    { preset: "pop", duration: 0.6, distance: 0, easing: "bounce", hover: "lift" },
    // Text (Guarantee) — rotate entrance with tilt hover
    { preset: "rotate-in", duration: 0.65, distance: 0, easing: "smooth", hover: "tilt" },
    // Countdown — zoom in with pulsing loop and scroll-fade
    { preset: "zoom-in", duration: 0.6, distance: 0, easing: "ease-out", loop: "pulse", scrollFade: true },
    // FAQ — fade up with parallax and lift hover
    { preset: "fade-up", duration: 0.6, distance: 32, easing: "smooth", parallax: 8, hover: "lift" },
    // CTA — dramatic reveal with parallax float and glow
    { preset: "reveal-up", duration: 0.85, distance: 48, easing: "smooth", parallax: 22, hover: "glow", loop: "float" },
    // Footer — gentle fade with scroll-linked opacity
    { preset: "fade", duration: 0.5, distance: 0, scrollFade: true },
  ]);
}

function createAtlasExecutiveCvBlocks(): BlockInput[] {
  return animateBlocks([
    block("HERO", {
      eyebrow: "PROJECT & OPERATIONS LEADER",
      badge: "Open to senior opportunities",
      heading: "John Smith",
      subheading:
        "Project Manager with 10+ years of experience leading cross-functional teams, complex programs, and measurable operational improvements.",
      primaryLabel: "Email John",
      primaryHref: "mailto:john.smith@example.com",
      secondaryLabel: "LinkedIn Profile",
      secondaryHref: "https://linkedin.com",
      trustText: "Austin, TX · +1 512 456 7890 · john.smith@example.com",
      stats: [
        { value: "10+ yrs", label: "Leadership" },
        { value: "$12M", label: "Programs delivered" },
        { value: "24%", label: "Avg. efficiency gain" },
      ],
      layout: "centered",
      height: "compact",
      buttonStyle: "outline",
      overlay: "none",
      align: "center",
    }),
    block("TEXT", {
      eyebrow: "Professional Summary",
      heading: "Leadership grounded in clarity, accountability, and measurable outcomes.",
      body:
        "<p>I am an experienced professional with a solid background in project management. My consistent record of successfully delivering projects on time and within budget is combined with effective team leadership, stakeholder communication, and strategic planning.</p><p>I thrive in ambiguous environments where structure, calm decision-making, and collaborative execution create meaningful business results.</p>",
      attribution: "Available for Project Director, Program Lead, and Operations roles.",
      imagePosition: "none",
      layout: "narrow",
      tone: "bordered",
      align: "left",
    }),
    block("STEPS", {
      eyebrow: "Experience",
      heading: "A decade of building teams and delivering complex work.",
      subheading: "Replace these sample roles with your employment history, results, and responsibilities.",
      layout: "timeline",
      tone: "light",
      columns: 4,
      align: "left",
      markerStyle: "dot",
      items: [
        { eyebrow: "2015 — PRESENT", icon: "", title: "Project Manager · Acme", description: "Managed 10–15 active projects, optimized delivery processes, and built clear client reporting systems.", meta: "Austin, TX", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "2010 — 2015", icon: "", title: "Assistant Project Manager · Axis Inc.", description: "Coordinated cross-functional delivery, project documentation, risk tracking, and client communication.", meta: "Remote", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "2006 — 2010", icon: "", title: "Project Coordinator · DEF Corp.", description: "Supported schedules, status reports, resource planning, and stakeholder meetings across major software upgrades.", meta: "Dallas, TX", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "2004 — 2006", icon: "", title: "Project Management Intern · GHI Co.", description: "Prepared materials, maintained logs, and supported team planning and brainstorming sessions.", meta: "Houston, TX", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),
    block("COLUMNS", {
      heading: "Education & Credentials",
      subheading: "Academic foundations and continuing professional development.",
      columns: 2,
      gap: "md",
      align: "left",
      layout: "cards",
      cardStyle: "outline",
      verticalAlign: "stretch",
      items: [
        { eyebrow: "2010", icon: "▣", imageUrl: "", imageAlt: "", heading: "MBA · Harvard Business School", body: "<p>Specialization in strategy, organizational leadership, and operations.</p>", meta: "Cambridge, MA", buttonLabel: "", buttonHref: "#", highlighted: true },
        { eyebrow: "2004", icon: "◇", imageUrl: "", imageAlt: "", heading: "BSc Business Management", body: "<p>Graduate magna cum laude with a focus on project management.</p>", meta: "State University", buttonLabel: "", buttonHref: "#", highlighted: false },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Selected Projects",
      heading: "Work that improved systems, speed, and customer experience.",
      subheading: "Use concise, outcome-focused case studies rather than long task lists.",
      columns: 3,
      layout: "cards",
      cardStyle: "elevated",
      align: "left",
      iconStyle: "number",
      items: [
        { eyebrow: "OPERATIONS", icon: "01", title: "Project Alpha", description: "Spearheaded a high-stakes workflow redesign that improved delivery speed and reduced escalation volume.", imageUrl: "", imageAlt: "", linkLabel: "Read case study", linkHref: "#", highlighted: true },
        { eyebrow: "TECHNOLOGY", icon: "02", title: "Enterprise Upgrade", description: "Led a cross-functional team through a major platform migration with zero critical downtime.", imageUrl: "", imageAlt: "", linkLabel: "Read case study", linkHref: "#", highlighted: false },
        { eyebrow: "CUSTOMER", icon: "03", title: "Service Recovery", description: "Created a customer recovery playbook that increased satisfaction and shortened response time.", imageUrl: "", imageAlt: "", linkLabel: "Read case study", linkHref: "#", highlighted: false },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Core Skills",
      heading: "Capabilities built across strategy, people, and delivery.",
      columns: 3,
      layout: "list",
      cardStyle: "soft",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "DELIVERY", icon: "✓", title: "Program Management", description: "Roadmaps, dependencies, risk, budget, and quality management.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "LEADERSHIP", icon: "✓", title: "Team Leadership", description: "Coaching, facilitation, conflict resolution, and executive communication.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "STRATEGY", icon: "✓", title: "Business Operations", description: "Process improvement, decision analysis, change, and resource planning.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),
    block("CTA", {
      eyebrow: "Let’s Connect",
      heading: "Looking for a leader who can turn complexity into forward motion?",
      description: "I am open to discussing senior project, program, and operations opportunities.",
      buttonLabel: "john.smith@example.com",
      buttonHref: "mailto:john.smith@example.com",
      secondaryLabel: "View LinkedIn",
      secondaryHref: "https://linkedin.com",
      note: "Austin, Texas · Available for remote and hybrid roles",
      layout: "minimal",
      tone: "dark",
      buttonStyle: "solid",
      height: "compact",
      align: "left",
    }),
    block("FOOTER", {
      brand: "JOHN SMITH",
      description: "Project leadership · Operations · Business transformation",
      copyright: "Resume and portfolio. All rights reserved.",
      layout: "minimal",
      tone: "light",
      width: "wide",
      showBrand: true,
      showCopyright: true,
      showSocial: true,
      navItems: [
        { label: "Experience", href: "#experience", description: "", badge: "" },
        { label: "Projects", href: "#projects", description: "", badge: "" },
      ],
      socialItems: [
        { label: "LinkedIn", href: "https://linkedin.com", description: "", badge: "" },
        { label: "Email", href: "mailto:john.smith@example.com", description: "", badge: "" },
      ],
    }),
  ], [
    // Hero — fade on load for instant name visibility
    { preset: "fade", duration: 0.4, distance: 0, trigger: "load", hover: "lift" },
    // Summary — fade up with subtle parallax
    { preset: "fade-up", duration: 0.6, distance: 24, easing: "smooth", parallax: 6, hover: "glow" },
    // Experience timeline — reveal up with clip-path for dramatic entrance
    { preset: "reveal-up", duration: 0.75, distance: 36, easing: "smooth", parallax: 10, hover: "lift" },
    // Education — fade left with grow hover
    { preset: "fade-left", duration: 0.65, distance: 32, easing: "ease-out", hover: "grow" },
    // Selected Projects — flip-up 3D with spring easing
    { preset: "flip-up", duration: 0.7, distance: 0, easing: "spring", hover: "lift" },
    // Core Skills — blur entrance with breathing loop
    { preset: "blur-in", duration: 0.6, distance: 0, easing: "smooth", hover: "glow", loop: "breathe" },
    // CTA — pop with bounce and float loop
    { preset: "pop", duration: 0.6, distance: 0, easing: "bounce", hover: "glow", loop: "float" },
    // Footer — gentle fade with scroll-fade
    { preset: "fade", duration: 0.45, distance: 0, scrollFade: true },
  ]);
}

function createJasonCreatorPortfolioBlocks(): BlockInput[] {
  return animateBlocks([
    block("HEADER", {
      logoText: "JASON CHIN",
      tagline: "No-code creator & consultant",
      primaryLabel: "Book a Call",
      primaryHref: "#contact",
      layout: "split",
      tone: "light",
      width: "wide",
      buttonStyle: "solid",
      sticky: true,
      mobileMenu: true,
      showLogo: true,
      showNav: true,
      showCta: true,
      navItems: [
        { label: "Skills", href: "#skills", description: "Tools & certifications", badge: "" },
        { label: "Projects", href: "#projects", description: "Selected case studies", badge: "Featured" },
        { label: "Services", href: "#services", description: "Consultation to full build", badge: "" },
      ],
    }),
    block("HERO", {
      eyebrow: "PORTFOLIO · AVAILABLE FOR SELECT PROJECTS",
      badge: "Notion Certified Creator",
      heading: "Hello, I’m Jason. I turn complex workflows into calm, useful systems.",
      subheading: "I help people and small teams organize knowledge, automate repetitive work, and ship better digital experiences with no-code tools.",
      primaryLabel: "Explore My Work",
      primaryHref: "#projects",
      secondaryLabel: "Book a Call",
      secondaryHref: "#contact",
      mediaUrl: "/templates/1534528741775-53994a69da-148429b6.jpg",
      mediaAlt: "Creator working on a laptop",
      mediaCaption: "Strategy · systems · thoughtful execution",
      trustText: "Trusted by founders, independent teams, and growing creators",
      stats: [
        { value: "42+", label: "Systems shipped" },
        { value: "18", label: "Client workspaces" },
        { value: "4.9/5", label: "Client rating" },
      ],
      layout: "split",
      height: "normal",
      buttonStyle: "solid",
      mediaPosition: "right",
      overlay: "none",
      align: "left",
    }),
    block("LOGOS", {
      eyebrow: "Skills & Tools",
      heading: "A practical toolkit for ideas that need to become real.",
      subheading: "Replace these sample tools with your own capabilities and certifications.",
      layout: "cards",
      tone: "soft",
      columns: 5,
      logoSize: "sm",
      align: "center",
      grayscale: true,
      items: [
        { name: "Notion", url: "", href: "#", category: "Workspace", featured: true },
        { name: "Figma", url: "", href: "#", category: "Design", featured: false },
        { name: "Webflow", url: "", href: "#", category: "Website", featured: false },
        { name: "Google Sheets", url: "", href: "#", category: "Data", featured: false },
        { name: "Make", url: "", href: "#", category: "Automation", featured: false },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Featured Projects",
      heading: "Selected work built around clarity and adoption.",
      subheading: "Each project combines strategy, thoughtful structure, and documentation people actually use.",
      columns: 2,
      layout: "media",
      cardStyle: "elevated",
      align: "left",
      iconStyle: "number",
      items: [
        { eyebrow: "CONSULTING", icon: "01", title: "Freelancer Operating System", description: "A Notion workspace connecting leads, projects, invoices, content, and weekly planning for an independent consultant.", imageUrl: "/templates/1454165804606-c3d57bc86b-ee0c5f0f.jpg", imageAlt: "Freelancer planning workspace", linkLabel: "View project", linkHref: "#", highlighted: true },
        { eyebrow: "CONTENT", icon: "02", title: "Creator Content Workspace", description: "A collaborative system for research, editorial planning, production status, and repurposing across channels.", imageUrl: "/templates/1434626881859-194d67b2b8-124c3fcc.jpg", imageAlt: "Creator content planning", linkLabel: "View project", linkHref: "#", highlighted: false },
        { eyebrow: "AUTOMATION", icon: "03", title: "Client Onboarding Flow", description: "An automated flow that reduced manual setup and gave every new client a clear, premium first experience.", imageUrl: "/templates/1552664730-d307ca884978-93fc4356.jpg", imageAlt: "Team onboarding workshop", linkLabel: "View project", linkHref: "#", highlighted: false },
        { eyebrow: "WEBSITE", icon: "04", title: "Consultant Portfolio Launch", description: "Messaging, information architecture, and a responsive no-code website designed to convert qualified leads.", imageUrl: "/templates/1460661419201-fd4cecdf8a-b962b409.jpg", imageAlt: "Creative portfolio project", linkLabel: "View project", linkHref: "#", highlighted: false },
      ],
    }),
    block("COLUMNS", {
      heading: "Services designed for the stage you are in.",
      subheading: "Start with a focused consultation or partner with me for an end-to-end build.",
      columns: 3,
      gap: "md",
      align: "left",
      layout: "cards",
      cardStyle: "elevated",
      verticalAlign: "stretch",
      items: [
        { eyebrow: "90 MINUTES", icon: "◇", imageUrl: "", imageAlt: "", heading: "System Consultation", body: "<p>Clarify the real workflow problem and leave with an actionable system blueprint.</p><ul><li>Workflow audit</li><li>Priority map</li><li>Written recommendations</li></ul>", meta: "From $250", buttonLabel: "Book consultation", buttonHref: "#contact", highlighted: false },
        { eyebrow: "2–4 WEEKS", icon: "▣", imageUrl: "", imageAlt: "", heading: "Custom Workspace", body: "<p>A tailored workspace that fits the way your team plans, communicates, and delivers.</p><ul><li>Architecture</li><li>Templates</li><li>Team onboarding</li></ul>", meta: "From $1,500", buttonLabel: "Discuss a project", buttonHref: "#contact", highlighted: true },
        { eyebrow: "3–6 WEEKS", icon: "↗", imageUrl: "", imageAlt: "", heading: "No-code Website", body: "<p>A clear, responsive portfolio or service website—from structure through launch.</p><ul><li>Messaging</li><li>Design direction</li><li>Build & handoff</li></ul>", meta: "From $2,400", buttonLabel: "Discuss a website", buttonHref: "#contact", highlighted: false },
      ],
    }),
    block("STATS", {
      eyebrow: "Small systems, meaningful results",
      heading: "Work that helps people spend less time managing work.",
      layout: "inline",
      tone: "dark",
      columns: 4,
      align: "center",
      items: [
        { icon: "", value: "42+", label: "Projects delivered", description: "", trend: "", highlighted: true },
        { icon: "", value: "31%", label: "Average time saved", description: "", trend: "", highlighted: false },
        { icon: "", value: "12", label: "Industries served", description: "", trend: "", highlighted: false },
        { icon: "", value: "80%", label: "Referral work", description: "", trend: "", highlighted: false },
      ],
    }),
    block("CONTACT_FORM", {
      eyebrow: "Let’s Work Together",
      heading: "Tell me what you are trying to make easier.",
      description: "Share a little context about your project, timeline, and the outcome you want. This demo form can be connected from block settings.",
      buttonLabel: "Send project inquiry",
      nameLabel: "Name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      companyLabel: "Company",
      companyPlaceholder: "Studio or company",
      subjectLabel: "Project type",
      subjectPlaceholder: "Workspace, automation, or website",
      messageLabel: "Tell me about your project",
      messagePlaceholder: "Goals, current challenges, timeline, and budget range…",
      privacyText: "Your information is only used to respond to this inquiry.",
      recipientEmail: "hello@jasonchin.example",
      contactEmail: "hello@jasonchin.example",
      responseTime: "Usually replies within 2 business days",
      layout: "split",
      tone: "soft",
      width: "wide",
      buttonStyle: "solid",
      fieldStyle: "outline",
      submitMode: "mailto",
      showCompany: true,
      showSubject: true,
      showContactInfo: true,
      compact: false,
      align: "left",
    }),
    block("FAQ", {
      eyebrow: "FAQ",
      heading: "A few details before we begin.",
      subheading: "Clear expectations make collaboration easier for everyone.",
      layout: "single",
      tone: "soft",
      iconStyle: "plus",
      answerStyle: "plain",
      allowMultipleOpen: true,
      align: "left",
      items: [
        { question: "What do you need from me to start?", answer: "A short description of your goals, existing tools, biggest friction points, and the people who will use the final system.", category: "Process", anchor: "", icon: "", highlighted: true, defaultOpen: true },
        { question: "Can you work with an existing Notion workspace?", answer: "Yes. I can audit and improve an existing workspace or recommend a cleaner rebuild when that is more practical.", category: "Tools", anchor: "", icon: "", highlighted: false, defaultOpen: false },
        { question: "Do you offer ongoing support?", answer: "Selected projects can include documentation, team training, and an ongoing optimization retainer.", category: "Support", anchor: "", icon: "", highlighted: false, defaultOpen: false },
      ],
    }),
    block("CTA", {
      eyebrow: "Have a project in mind?",
      heading: "Let’s build a system your future self will thank you for.",
      description: "Book a short conversation and we will identify the clearest next step together.",
      buttonLabel: "Book a Discovery Call",
      buttonHref: "#contact",
      secondaryLabel: "Email Instead",
      secondaryHref: "mailto:hello@jasonchin.example",
      note: "No pressure · 20-minute intro call · Clear next steps",
      layout: "card",
      tone: "accent",
      buttonStyle: "solid",
      height: "normal",
      align: "center",
    }),
    block("FOOTER", {
      brand: "JASON CHIN",
      description: "No-code systems and digital experiences built with clarity.",
      copyright: "Jason Chin Portfolio. All rights reserved.",
      layout: "centered",
      tone: "light",
      width: "wide",
      showBrand: true,
      showCopyright: true,
      showSocial: true,
      navItems: [
        { label: "Projects", href: "#projects", description: "", badge: "" },
        { label: "Services", href: "#services", description: "", badge: "" },
        { label: "Contact", href: "#contact", description: "", badge: "" },
      ],
      socialItems: [
        { label: "LinkedIn", href: "https://linkedin.com", description: "", badge: "" },
        { label: "Instagram", href: "https://instagram.com", description: "", badge: "" },
      ],
    }),
  ], [
    // Header — subtle fade on load
    { preset: "fade", duration: 0.3, distance: 0, trigger: "load" },
    // Hero — dramatic reveal with floating loop and parallax
    { preset: "reveal-up", duration: 0.85, distance: 48, easing: "smooth", parallax: 16, hover: "lift", loop: "float" },
    // Skills/Logos — fade up with grow hover
    { preset: "fade-up", duration: 0.55, distance: 24, easing: "smooth", hover: "grow" },
    // Featured Projects — zoom in with parallax and lift hover
    { preset: "zoom-in", duration: 0.7, distance: 0, easing: "smooth", parallax: 12, hover: "lift" },
    // Services — flip-up 3D with spring easing
    { preset: "flip-up", duration: 0.75, distance: 0, easing: "spring", hover: "lift" },
    // Stats — pop with bounce physics and glow
    { preset: "pop", duration: 0.6, distance: 0, easing: "bounce", hover: "glow", scrollFade: true },
    // Contact Form — fade right with tilt hover and parallax
    { preset: "fade-right", duration: 0.7, distance: 44, easing: "smooth", parallax: 8, hover: "tilt" },
    // FAQ — blur entrance with breathing loop
    { preset: "blur-in", duration: 0.6, distance: 0, easing: "smooth", hover: "glow", loop: "breathe" },
    // CTA — reveal up with float loop and glow
    { preset: "reveal-up", duration: 0.8, distance: 42, easing: "smooth", hover: "glow", loop: "float", parallax: 18 },
    // Footer — gentle fade with scroll-fade
    { preset: "fade", duration: 0.45, distance: 0, scrollFade: true },
  ]);
}

function createMaisonEditorialCvBlocks(): BlockInput[] {
  return animateBlocks([
    block("HEADER", {
      logoText: "BREANNA MASON",
      tagline: "Brand & Editorial Consultant",
      primaryLabel: "Start a Project",
      primaryHref: "#contact",
      layout: "center",
      tone: "transparent",
      width: "wide",
      buttonStyle: "outline",
      sticky: false,
      mobileMenu: true,
      showLogo: true,
      showNav: true,
      showCta: true,
      navItems: [
        { label: "Experience", href: "#experience", description: "9+ years editorial & brand", badge: "" },
        { label: "Selected Work", href: "#work", description: "Campaigns & editorial series", badge: "" },
        { label: "Contact", href: "#contact", description: "Start a project together", badge: "" },
      ],
    }),
    block("TEXT", {
      eyebrow: "Professional Summary",
      heading: "I shape thoughtful brand stories that feel human, distinctive, and commercially clear.",
      subheading: "Editorial strategy, social campaigns, and creative direction for brands in culture, lifestyle, and design.",
      body: "<p>For more than nine years, I have helped teams find the strongest story inside their products and ideas. My work connects audience insight, editorial judgment, and practical delivery—from positioning and campaign concepts to content systems that teams can sustain.</p><p>I care about language, visual rhythm, and the small details that make communication feel considered rather than manufactured.</p>",
      buttonLabel: "View Selected Work",
      buttonHref: "#work",
      attribution: "Based in California · Available worldwide",
      imageUrl: "/templates/1494790108377-be9c29b293-03670ea1.jpg",
      imageAlt: "Portrait of editorial consultant Breanna Mason",
      imagePosition: "left",
      layout: "split",
      tone: "plain",
      align: "left",
    }),
    block("COLUMNS", {
      heading: "Work Experience",
      subheading: "Strategy, storytelling, and creative leadership across in-house and independent roles.",
      columns: 2,
      gap: "lg",
      align: "left",
      layout: "timeline",
      cardStyle: "outline",
      verticalAlign: "top",
      items: [
        { eyebrow: "2016 — PRESENT", icon: "", imageUrl: "", imageAlt: "", heading: "Social Media Marketing Consultant", body: "<p>Lead editorial strategy, campaign planning, creator direction, and performance reviews for lifestyle and culture brands.</p>", meta: "Independent · California", buttonLabel: "", buttonHref: "#", highlighted: true },
        { eyebrow: "2014 — 2016", icon: "", imageUrl: "", imageAlt: "", heading: "Influencer Marketing Lead", body: "<p>Built creator partnerships, campaign frameworks, briefing systems, and reporting practices for a growing agency portfolio.</p>", meta: "L.P. Freelancers", buttonLabel: "", buttonHref: "#", highlighted: false },
        { eyebrow: "2011 — 2014", icon: "", imageUrl: "", imageAlt: "", heading: "Editorial Producer", body: "<p>Produced interviews, features, and branded editorial packages across digital channels and live cultural moments.</p>", meta: "North & West Studio", buttonLabel: "", buttonHref: "#", highlighted: false },
        { eyebrow: "2009 — 2011", icon: "", imageUrl: "", imageAlt: "", heading: "Junior Copywriter", body: "<p>Developed campaign copy, product narratives, and editorial research for fashion, food, and design accounts.</p>", meta: "Form House", buttonLabel: "", buttonHref: "#", highlighted: false },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Selected Campaigns",
      heading: "Work where strategy and story strengthen each other.",
      subheading: "Use these cards for campaign summaries, portfolio links, and measurable outcomes.",
      columns: 3,
      layout: "media",
      cardStyle: "elevated",
      align: "left",
      iconStyle: "number",
      items: [
        { eyebrow: "BRAND LAUNCH", icon: "01", title: "A More Considered Morning", description: "Positioning and launch narrative for a sustainable home ritual brand, spanning web, social, and creator partnerships.", imageUrl: "/templates/1494438639946-1ebd1d20bf-846324bb.jpg", imageAlt: "Editorial interior campaign", linkLabel: "View campaign", linkHref: "#", highlighted: true },
        { eyebrow: "EDITORIAL SERIES", icon: "02", title: "Women Who Make", description: "An interview-led content series celebrating independent makers and building long-term brand affinity.", imageUrl: "/templates/1455390582262-044cdead27-d7928e50.jpg", imageAlt: "Editorial writing project", linkLabel: "View series", linkHref: "#", highlighted: false },
        { eyebrow: "CREATOR CAMPAIGN", icon: "03", title: "Objects With a Story", description: "Creator direction and editorial toolkit that increased usable content while preserving each voice.", imageUrl: "/templates/1456324504439-367cee3b3c-5d4f6e68.jpg", imageAlt: "Creative editorial workspace", linkLabel: "View case study", linkHref: "#", highlighted: false },
      ],
    }),
    block("COLUMNS", {
      heading: "Education & Recognition",
      subheading: "A foundation in communication with continued learning across strategy and culture.",
      columns: 2,
      gap: "md",
      align: "left",
      layout: "plain",
      cardStyle: "outline",
      verticalAlign: "top",
      items: [
        { eyebrow: "EDUCATION", icon: "◇", imageUrl: "", imageAlt: "", heading: "MA, Strategic Communication", body: "<p>Focused on audience research, narrative strategy, and integrated communication.</p>", meta: "2011 · California", buttonLabel: "", buttonHref: "#", highlighted: false },
        { eyebrow: "RECOGNITION", icon: "★", imageUrl: "", imageAlt: "", heading: "Independent Creative Awards", body: "<p>Selected recognition for editorial direction, campaign writing, and collaborative creative work.</p>", meta: "2018 — 2025", buttonLabel: "", buttonHref: "#", highlighted: true },
      ],
    }),
    block("LOGOS", {
      eyebrow: "Selected Collaborations",
      heading: "Trusted by teams that care about how their story is told.",
      layout: "plain",
      tone: "soft",
      columns: 5,
      logoSize: "md",
      align: "center",
      grayscale: true,
      items: [
        { name: "Atelier North", url: "", href: "#", category: "Design", featured: true },
        { name: "Common Form", url: "", href: "#", category: "Culture", featured: false },
        { name: "Field Notes", url: "", href: "#", category: "Editorial", featured: false },
        { name: "Still House", url: "", href: "#", category: "Lifestyle", featured: false },
        { name: "New Ritual", url: "", href: "#", category: "Wellness", featured: false },
      ],
    }),
    block("TESTIMONIAL", {
      eyebrow: "References",
      heading: "A thoughtful partner from first question to final detail.",
      subheading: "Sample client references—replace them with verified quotes from your collaborators.",
      layout: "grid",
      tone: "light",
      columns: 2,
      align: "left",
      showQuotes: true,
      items: [
        { quote: "Breanna gave us language for what we had been trying to say for years. The strategy was clear, generous, and immediately useful across the team.", authorName: "Mara Ellis", authorRole: "Founder · Still House", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "She protects the idea while staying deeply practical about timelines, stakeholders, and what the audience actually needs.", authorName: "Daniel Cho", authorRole: "Creative Director · Atelier North", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),
    block("CONTACT_FORM", {
      eyebrow: "Contact",
      heading: "Tell me what you are hoping to make meaningful.",
      description: "For consulting, campaign direction, editorial strategy, and selected speaking engagements.",
      buttonLabel: "Send inquiry",
      nameLabel: "Name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      companyLabel: "Organization",
      companyPlaceholder: "Brand or studio",
      subjectLabel: "Project type",
      subjectPlaceholder: "Editorial, campaign, or consulting",
      messageLabel: "Project note",
      messagePlaceholder: "Share the context, desired outcome, timing, and approximate scope…",
      recipientEmail: "hello@breannamason.example",
      contactEmail: "hello@breannamason.example",
      contactAddress: "California, USA · Working worldwide",
      responseTime: "Replies within 2–3 business days",
      layout: "split",
      tone: "soft",
      width: "wide",
      buttonStyle: "outline",
      fieldStyle: "underline",
      submitMode: "mailto",
      showCompany: true,
      showSubject: true,
      showContactInfo: true,
      align: "left",
    }),
    block("CTA", {
      eyebrow: "Currently booking selected engagements",
      heading: "Good stories begin with a precise, generous conversation.",
      description: "If you are shaping a new brand chapter, campaign, or editorial platform, I would be glad to hear about it.",
      buttonLabel: "Start a Conversation",
      buttonHref: "mailto:hello@breannamason.example",
      secondaryLabel: "LinkedIn Profile",
      secondaryHref: "https://linkedin.com",
      note: "Editorial strategy · Brand narrative · Creative direction",
      layout: "minimal",
      tone: "dark",
      buttonStyle: "outline",
      height: "compact",
      align: "center",
    }),
    block("FOOTER", {
      brand: "BREANNA MASON",
      description: "Brand stories, editorial systems, and thoughtful creative direction.",
      copyright: "Breanna Mason Portfolio. All rights reserved.",
      layout: "minimal",
      tone: "light",
      width: "wide",
      showBrand: true,
      showCopyright: true,
      showSocial: true,
      navItems: [
        { label: "Experience", href: "#experience", description: "", badge: "" },
        { label: "Selected Work", href: "#work", description: "", badge: "" },
      ],
      socialItems: [
        { label: "LinkedIn", href: "https://linkedin.com", description: "", badge: "" },
        { label: "Email", href: "mailto:hello@breannamason.example", description: "", badge: "" },
      ],
    }),
  ], [
    // Header — subtle fade on load
    { preset: "fade", duration: 0.3, distance: 0, trigger: "load" },
    // Summary — elegant slide from right with glow hover and parallax
    { preset: "fade-right", duration: 0.75, distance: 42, easing: "smooth", parallax: 14, hover: "glow" },
    // Work Experience — reveal up with clip-path and lift hover
    { preset: "reveal-up", duration: 0.75, distance: 38, easing: "smooth", parallax: 10, hover: "lift" },
    // Selected Campaigns — zoom in with grow hover and parallax
    { preset: "zoom-in", duration: 0.7, distance: 0, easing: "smooth", parallax: 12, hover: "grow" },
    // Education — fade left with tilt hover
    { preset: "fade-left", duration: 0.65, distance: 34, easing: "ease-out", hover: "tilt" },
    // Logos/Collaborations — fade up with scroll-fade
    { preset: "fade-up", duration: 0.55, distance: 22, easing: "smooth", scrollFade: true, hover: "grow" },
    // Testimonial — blur entrance with breathing loop and glow
    { preset: "blur-in", duration: 0.65, distance: 0, easing: "smooth", hover: "glow", loop: "breathe" },
    // Contact Form — flip-up 3D with spring easing
    { preset: "flip-up", duration: 0.7, distance: 0, easing: "spring", hover: "lift" },
    // CTA — pop with bounce and float loop
    { preset: "pop", duration: 0.6, distance: 0, easing: "bounce", hover: "glow", loop: "float" },
    // Footer — gentle fade with scroll-fade
    { preset: "fade", duration: 0.45, distance: 0, scrollFade: true },
  ]);
}

function createAlbertVideoProducerBlocks(): BlockInput[] {
  return animateBlocks([
    block("HERO", {
      eyebrow: "VIDEO PRODUCER · CORPORATE STORYTELLING",
      badge: "Available for selected productions",
      heading: "Hello, I’m Albert. I help companies turn complex ideas into films people remember.",
      subheading: "For 8+ years I have produced brand films, documentaries, event stories, and executive content for teams ranging from ambitious startups to global organizations.",
      primaryLabel: "Book a Consultation",
      primaryHref: "mailto:hello@heyalbert.example",
      secondaryLabel: "View Selected Work",
      secondaryHref: "#projects",
      mediaUrl: "/templates/1500648767791-00dcc994a4-ccc52d44.jpg",
      mediaAlt: "Albert, video producer and creative director",
      mediaCaption: "Producer · Director · Story Partner",
      trustText: "Corporate film · Documentary · Branded content · Post-production",
      stats: [{ value: "8+", label: "Years of experience" }, { value: "240+", label: "Projects completed" }, { value: "98.9%", label: "Satisfied clients" }],
      layout: "split",
      height: "normal",
      buttonStyle: "solid",
      buttonColor: "#111827",
      buttonTextColor: "#ffffff",
      mediaPosition: "right",
      overlay: "none",
      align: "left",
    }),
    block("LOGOS", {
      eyebrow: "Brands",
      heading: "Trusted by teams that care about the quality of their story.",
      subheading: "Sample brand names—replace these with clients you are permitted to display.",
      layout: "plain",
      tone: "light",
      columns: 5,
      logoSize: "md",
      align: "center",
      grayscale: true,
      items: [
        { name: "Northstar", url: "", href: "#", category: "Technology", featured: true },
        { name: "Outline", url: "", href: "#", category: "Design", featured: false },
        { name: "Common Co.", url: "", href: "#", category: "Lifestyle", featured: false },
        { name: "Aperture", url: "", href: "#", category: "Media", featured: false },
        { name: "Fieldwork", url: "", href: "#", category: "Consulting", featured: false },
      ],
    }),
    block("STATS", {
      eyebrow: "Production at a glance",
      heading: "Experience measured in completed stories and returning partners.",
      layout: "strip",
      tone: "soft",
      columns: 4,
      align: "center",
      items: [
        { icon: "▶", value: "240+", label: "Films delivered", description: "From concept through final master", trend: "", highlighted: true },
        { icon: "◎", value: "120+", label: "Customers", description: "Across corporate and creative sectors", trend: "", highlighted: false },
        { icon: "★", value: "14", label: "Industry awards", description: "Sample recognition data", trend: "", highlighted: false },
        { icon: "↗", value: "72%", label: "Repeat clients", description: "Built through reliable collaboration", trend: "", highlighted: false },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Skills",
      heading: "A full-production skill set with strategy at the center.",
      subheading: "Each skill and proficiency label can be edited in the builder.",
      columns: 3,
      layout: "list",
      cardStyle: "outline",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "ADVANCED", icon: "●", title: "Creative Development", description: "Research, treatments, scripts, interview design, and visual direction.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "ADVANCED", icon: "●", title: "Production Leadership", description: "Budgets, crews, schedules, stakeholders, locations, and calm delivery.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "ADVANCED", icon: "●", title: "Adobe Premiere Pro", description: "Editorial structure, pacing, sound, finishing, and delivery workflows.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "ADVANCED", icon: "●", title: "Adobe After Effects", description: "Motion design, title systems, explainers, and compositing.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "INTERMEDIATE", icon: "◐", title: "Cinema Camera Systems", description: "Production-ready camera, lighting, and audio collaboration.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "WORKING KNOWLEDGE", icon: "◐", title: "Production Automation", description: "File workflows, review systems, metadata, and delivery automation.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),
    block("GALLERY", {
      eyebrow: "Selected Projects",
      heading: "Different formats. One standard: make the message clear and worth watching.",
      subheading: "Replace the sample images, titles, captions, and links with your own reel.",
      layout: "featured",
      columns: 3,
      gap: "sm",
      aspectRatio: "video",
      frame: "rounded",
      captionPosition: "overlay",
      hoverEffect: "zoom",
      lightbox: true,
      align: "left",
      items: [
        { url: "/templates/1485846234645-a62644f847-ad8f1149.jpg", alt: "Corporate documentary production", title: "Inside the Mission", caption: "Corporate documentary · 12 min", href: "#", featured: true },
        { url: "/templates/1489599849927-2ee91cede3-f8985500.jpg", alt: "Cinema audience", title: "A Shared Future", caption: "Brand film · 90 sec", href: "#", featured: false },
        { url: "/templates/1492691527719-9d1e07e534-59d26cef.jpg", alt: "Camera production", title: "Makers at Work", caption: "Creator series · 6 episodes", href: "#", featured: false },
      ],
    }),
    block("COLUMNS", {
      heading: "Services",
      subheading: "Engage me for a focused production or an end-to-end story partnership.",
      columns: 3,
      gap: "md",
      align: "left",
      layout: "cards",
      cardStyle: "elevated",
      verticalAlign: "stretch",
      items: [
        { eyebrow: "STRATEGY", icon: "01", imageUrl: "", imageAlt: "", heading: "Creative Consultation", body: "<p>Clarify the audience, message, format, and most effective production approach.</p>", meta: "From $350", buttonLabel: "Ask about strategy", buttonHref: "mailto:hello@heyalbert.example", highlighted: false },
        { eyebrow: "PRODUCTION", icon: "02", imageUrl: "", imageAlt: "", heading: "Corporate Film", body: "<p>Concept, pre-production, filming, editing, motion, and final delivery.</p>", meta: "Custom scope", buttonLabel: "Plan a production", buttonHref: "mailto:hello@heyalbert.example", highlighted: true },
        { eyebrow: "RETAINER", icon: "03", imageUrl: "", imageAlt: "", heading: "Content Partnership", body: "<p>An ongoing production rhythm for brands that need consistent quality.</p>", meta: "Quarterly", buttonLabel: "Discuss a partnership", buttonHref: "mailto:hello@heyalbert.example", highlighted: false },
      ],
    }),
    block("COLUMNS", {
      heading: "Achievements",
      subheading: "Selected recognition—replace these examples with verified awards and press.",
      columns: 3,
      gap: "md",
      align: "left",
      layout: "numbered",
      cardStyle: "soft",
      verticalAlign: "stretch",
      items: [
        { eyebrow: "2025", icon: "★", imageUrl: "", imageAlt: "", heading: "Best Fast Time Director", body: "<p>Recognition for a corporate documentary series balancing pace, clarity, and human storytelling.</p>", meta: "REIMS Excellence Awards", buttonLabel: "", buttonHref: "#", highlighted: true },
        { eyebrow: "2024", icon: "★", imageUrl: "", imageAlt: "", heading: "Most Entertaining Campaign", body: "<p>Awarded for a social-first brand story adapted across six digital formats.</p>", meta: "International Film Festival", buttonLabel: "", buttonHref: "#", highlighted: false },
        { eyebrow: "2023", icon: "★", imageUrl: "", imageAlt: "", heading: "Corporate Speech Finalist", body: "<p>Shortlisted for executive storytelling and clear visual communication.</p>", meta: "Creative Communication Awards", buttonLabel: "", buttonHref: "#", highlighted: false },
      ],
    }),
    block("TESTIMONIAL", {
      eyebrow: "Testimonials",
      heading: "A reliable creative partner in rooms where the story really matters.",
      subheading: "Sample references—replace with approved client testimonials.",
      layout: "grid",
      tone: "soft",
      columns: 2,
      align: "left",
      showQuotes: true,
      items: [
        { quote: "Albert understood the business problem before proposing a shot list. The final film was elegant, precise, and easy for every market to use.", authorName: "Sarah Chen", authorRole: "Chief Marketing Officer · Northstar", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "He made a complex production feel calm. Every stakeholder felt heard, and every decision improved the story.", authorName: "David Morgan", authorRole: "Communications Director · Common Co.", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),
    block("CTA", {
      eyebrow: "Have a story worth making?",
      heading: "Let’s find the clearest, most memorable way to tell it.",
      description: "Share the objective, audience, timeline, and what success needs to look like.",
      buttonLabel: "Book a Consultation",
      buttonHref: "mailto:hello@heyalbert.example",
      secondaryLabel: "Download CV",
      secondaryHref: "#",
      note: "Corporate film · Brand story · Documentary · Content partnership",
      layout: "card",
      tone: "dark",
      buttonStyle: "solid",
      height: "normal",
      align: "center",
    }),
    block("FOOTER", {
      brand: "ALBERT STUDIO",
      description: "Films and content systems for companies with something meaningful to say.",
      copyright: "Albert Studio Portfolio. All rights reserved.",
      layout: "minimal",
      tone: "light",
      width: "wide",
      showBrand: true,
      showCopyright: true,
      showSocial: true,
      navItems: [{ label: "Projects", href: "#projects", description: "", badge: "" }, { label: "Services", href: "#services", description: "", badge: "" }],
      socialItems: [{ label: "Vimeo", href: "https://vimeo.com", description: "", badge: "" }, { label: "LinkedIn", href: "https://linkedin.com", description: "", badge: "" }],
    }),
  ], [
    // Hero — dramatic reveal on scroll with floating loop
    { preset: "reveal-up", duration: 0.85, distance: 48, easing: "smooth", parallax: 16, hover: "lift", loop: "float" },
    // Logos/Brands — fade with scroll-fade and grow hover
    { preset: "fade", duration: 0.4, distance: 0, scrollFade: true, hover: "grow" },
    // Stats — pop with bounce physics and glow
    { preset: "pop", duration: 0.6, distance: 0, easing: "bounce", hover: "glow" },
    // Skills — fade left with parallax and lift hover
    { preset: "fade-left", duration: 0.7, distance: 40, easing: "smooth", parallax: 10, hover: "lift" },
    // Gallery/Projects — zoom in with parallax and grow hover
    { preset: "zoom-in", duration: 0.7, distance: 0, easing: "smooth", parallax: 14, hover: "grow" },
    // Services — flip-up 3D with spring easing
    { preset: "flip-up", duration: 0.75, distance: 0, easing: "spring", hover: "lift" },
    // Achievements — reveal up with clip-path and tilt hover
    { preset: "reveal-up", duration: 0.7, distance: 36, easing: "smooth", hover: "tilt", parallax: 8 },
    // Testimonial — blur entrance with breathing loop
    { preset: "blur-in", duration: 0.65, distance: 0, easing: "smooth", hover: "glow", loop: "breathe" },
    // CTA — rotate in with bounce and float loop
    { preset: "rotate-in", duration: 0.65, distance: 0, easing: "bounce", hover: "glow", loop: "float" },
    // Footer — gentle fade with scroll-fade
    { preset: "fade", duration: 0.45, distance: 0, scrollFade: true },
  ]);
}

function createAlbertNotionConsultantBlocks(): BlockInput[] {
  return animateBlocks([
    block("HERO", {
      eyebrow: "NOTION CONSULTANT · WORKSPACE DESIGNER",
      badge: "Certified creator · Open for consulting",
      heading: "Albert — personalized Notion systems for minds and teams that need more clarity.",
      subheading: "I help individuals and growing companies turn scattered information into thoughtful workspaces that are simple to adopt, easy to maintain, and built around real behavior.",
      primaryLabel: "Book a Workspace Audit",
      primaryHref: "mailto:contact@heyalbert.example",
      secondaryLabel: "See System Examples",
      secondaryHref: "#systems",
      mediaUrl: "/templates/1500648767791-00dcc994a4-ccc52d44.jpg",
      mediaAlt: "Albert, Notion consultant and workspace designer",
      mediaCaption: "Systems should feel lighter after you build them.",
      trustText: "Notion · Automation · Documentation · Team enablement",
      stats: [{ value: "8+", label: "Years in systems" }, { value: "240+", label: "Projects completed" }, { value: "98.9%", label: "Satisfied clients" }],
      layout: "split",
      height: "normal",
      buttonStyle: "solid",
      mediaPosition: "left",
      overlay: "none",
      align: "left",
    }),
    block("MENU", {
      eyebrow: "Contact",
      heading: "Easy ways to reach and verify me.",
      description: "Replace these sample links and contact details with your own.",
      layout: "grid",
      tone: "soft",
      width: "wide",
      columns: 2,
      align: "left",
      showHeader: true,
      showDescriptions: true,
      items: [
        { label: "California, USA", href: "#", description: "Location and timezone", badge: "PST" },
        { label: "contact@heyalbert.example", href: "mailto:contact@heyalbert.example", description: "Email for project inquiries", badge: "Email" },
        { label: "heyalbert.example", href: "https://example.com", description: "Portfolio and resources", badge: "Web" },
        { label: "+1 234 567 890", href: "tel:+1234567890", description: "Scheduled calls only", badge: "Phone" },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Services",
      heading: "From workspace confusion to an operating system people use.",
      subheading: "Choose a focused audit, a complete build, or team enablement.",
      columns: 3,
      layout: "cards",
      cardStyle: "outline",
      align: "left",
      iconStyle: "number",
      items: [
        { eyebrow: "01", icon: "01", title: "Workspace Audit", description: "Find duplication, friction, unclear ownership, and the fastest improvements.", imageUrl: "", imageAlt: "", linkLabel: "Book an audit", linkHref: "mailto:contact@heyalbert.example", highlighted: false },
        { eyebrow: "02", icon: "02", title: "Custom Notion System", description: "A complete workspace designed around your workflows, roles, and reporting needs.", imageUrl: "", imageAlt: "", linkLabel: "Discuss a build", linkHref: "mailto:contact@heyalbert.example", highlighted: true },
        { eyebrow: "03", icon: "03", title: "Team Enablement", description: "Documentation, onboarding, governance, and live training that improve adoption.", imageUrl: "", imageAlt: "", linkLabel: "Train the team", linkHref: "mailto:contact@heyalbert.example", highlighted: false },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "System Projects",
      heading: "Workspaces built around decisions, not decorative dashboards.",
      columns: 2,
      layout: "media",
      cardStyle: "soft",
      align: "left",
      iconStyle: "number",
      items: [
        { eyebrow: "OPERATIONS", icon: "01", title: "Agency Delivery OS", description: "Connected sales, projects, capacity, client communication, and weekly reviews for a 25-person studio.", imageUrl: "/templates/1556761175-b413da4baf72-f2df8b2a.jpg", imageAlt: "Agency team workspace", linkLabel: "View system", linkHref: "#", highlighted: true },
        { eyebrow: "KNOWLEDGE", icon: "02", title: "Company Knowledge Hub", description: "A searchable source of truth for process, decisions, onboarding, and internal learning.", imageUrl: "/templates/1516321318423-f06f85e504-968a18d9.jpg", imageAlt: "Digital knowledge system", linkLabel: "View system", linkHref: "#", highlighted: false },
        { eyebrow: "CREATOR", icon: "03", title: "Content Production Engine", description: "Research, pipeline, asset library, publishing, and performance reviews in one calm system.", imageUrl: "/templates/1434626881859-194d67b2b8-124c3fcc.jpg", imageAlt: "Content planning workspace", linkLabel: "View system", linkHref: "#", highlighted: false },
        { eyebrow: "PERSONAL", icon: "04", title: "Personal Command Center", description: "Projects, notes, goals, routines, and reviews designed without unnecessary complexity.", imageUrl: "/templates/1456324504439-367cee3b3c-48b4cfa7.jpg", imageAlt: "Personal planning system", linkLabel: "View system", linkHref: "#", highlighted: false },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Skills",
      heading: "A mix of system thinking, facilitation, and technical execution.",
      columns: 3,
      layout: "list",
      cardStyle: "outline",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "ADVANCED", icon: "●", title: "Notion Architecture", description: "Databases, relations, formulas, templates, permissions, and scalable conventions.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "ADVANCED", icon: "●", title: "Workflow Facilitation", description: "Discovery, process mapping, decision design, and stakeholder alignment.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "ADVANCED", icon: "●", title: "Documentation", description: "Clear SOPs, onboarding paths, governance, and knowledge design.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "INTERMEDIATE", icon: "◐", title: "Automation", description: "Make, Zapier, forms, notifications, and lightweight API workflows.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "INTERMEDIATE", icon: "◐", title: "Data Design", description: "Google Sheets, imports, reporting logic, and maintainable data models.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "WORKING KNOWLEDGE", icon: "◐", title: "No-code Web", description: "Simple client portals, resource sites, and public knowledge experiences.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),
    block("COLUMNS", {
      heading: "Achievements",
      subheading: "Recognition, community contribution, and measurable practice milestones.",
      columns: 2,
      gap: "md",
      align: "left",
      layout: "timeline",
      cardStyle: "outline",
      verticalAlign: "top",
      items: [
        { eyebrow: "2025", icon: "★", imageUrl: "", imageAlt: "", heading: "Notion Community Ambassador", body: "<p>Recognized for practical education, community support, and thoughtful workspace examples.</p>", meta: "Community recognition", buttonLabel: "", buttonHref: "#", highlighted: true },
        { eyebrow: "2024", icon: "★", imageUrl: "", imageAlt: "", heading: "240th Client Workspace", body: "<p>A delivery milestone across independent professionals, creative teams, and service businesses.</p>", meta: "Practice milestone", buttonLabel: "", buttonHref: "#", highlighted: false },
      ],
    }),
    block("COLUMNS", {
      heading: "Education",
      subheading: "Formal foundations supported by continuous product and facilitation learning.",
      columns: 2,
      gap: "md",
      align: "left",
      layout: "plain",
      cardStyle: "soft",
      verticalAlign: "top",
      items: [
        { eyebrow: "2022 — PRESENT", icon: "◇", imageUrl: "", imageAlt: "", heading: "Bachelor of Information Technology", body: "<p>Systems analysis, information design, product thinking, and collaborative software practice.</p>", meta: "Multimedia University · CGPA 4.0", buttonLabel: "", buttonHref: "#", highlighted: true },
        { eyebrow: "CONTINUING STUDY", icon: "◇", imageUrl: "", imageAlt: "", heading: "Product & Facilitation Practice", body: "<p>Independent study across service design, documentation, behavioral adoption, and automation.</p>", meta: "Courses & communities", buttonLabel: "", buttonHref: "#", highlighted: false },
      ],
    }),
    block("CTA", {
      eyebrow: "Need a calmer workspace?",
      heading: "Let’s design a system that helps your team know what matters next.",
      description: "Start with a 60-minute workspace audit and leave with a prioritized improvement map.",
      buttonLabel: "Book a Workspace Audit",
      buttonHref: "mailto:contact@heyalbert.example",
      secondaryLabel: "View LinkedIn",
      secondaryHref: "https://linkedin.com",
      note: "Remote worldwide · Team workshops available",
      layout: "minimal",
      tone: "dark",
      buttonStyle: "solid",
      height: "compact",
      align: "center",
    }),
    block("FOOTER", {
      brand: "HEY ALBERT",
      description: "Personalized Notion systems for clearer work and calmer teams.",
      copyright: "Hey Albert Portfolio. All rights reserved.",
      layout: "centered",
      tone: "light",
      width: "wide",
      showBrand: true,
      showCopyright: true,
      showSocial: true,
      navItems: [{ label: "Services", href: "#services", description: "", badge: "" }, { label: "Systems", href: "#systems", description: "", badge: "" }],
      socialItems: [{ label: "LinkedIn", href: "https://linkedin.com", description: "", badge: "" }, { label: "Instagram", href: "https://instagram.com", description: "", badge: "" }, { label: "Email", href: "mailto:contact@heyalbert.example", description: "", badge: "" }],
    }),
  ], [
    { preset: "reveal-up", duration: 0.75, distance: 40, parallax: 8 },
    { preset: "fade-up", duration: 0.5, distance: 20 },
    { preset: "fade-left", duration: 0.6, distance: 32 },
    { preset: "zoom-in", duration: 0.6, distance: 0 },
    { preset: "fade-up", duration: 0.55, distance: 24 },
    { preset: "fade-right", duration: 0.6, distance: 34 },
    { preset: "reveal-up", duration: 0.65, distance: 32 },
    { preset: "pop", duration: 0.5, distance: 0, easing: "spring" },
    { preset: "fade", duration: 0.4, distance: 0 },
  ]);
}

function createAlbertCreativeResumeBlocks(): BlockInput[] {
  return animateBlocks([
    block("HEADER", {
      logoText: "ALBERT / CREATIVE TECH",
      tagline: "Systems, media & automation",
      primaryLabel: "Contact",
      primaryHref: "#contact",
      layout: "split",
      tone: "light",
      width: "wide",
      buttonStyle: "outline",
      sticky: true,
      mobileMenu: true,
      showLogo: true,
      showNav: true,
      showCta: true,
      navItems: [{ label: "Skills", href: "#skills", description: "", badge: "" }, { label: "Experience", href: "#experience", description: "", badge: "8+ yrs" }, { label: "Achievements", href: "#achievements", description: "", badge: "" }],
    }),
    block("HERO", {
      eyebrow: "CREATIVE TECHNOLOGIST · AUTOMATION BUILDER",
      badge: "Open to product and innovation roles",
      heading: "I connect creative ideas with systems that make them easier to ship.",
      subheading: "My work sits between content, operations, no-code development, and product thinking—helping teams move from ambitious concepts to repeatable execution.",
      primaryLabel: "Discuss an Opportunity",
      primaryHref: "mailto:albert.creative@example.com",
      secondaryLabel: "Read My Experience",
      secondaryHref: "#experience",
      mediaUrl: "/templates/1500648767791-00dcc994a4-ccc52d44.jpg",
      mediaAlt: "Albert, creative technologist",
      mediaCaption: "Creative thinking · technical curiosity · operational discipline",
      trustText: "Available for remote, hybrid, and consulting collaborations",
      layout: "split",
      height: "normal",
      buttonStyle: "solid",
      buttonColor: "#ea580c",
      buttonTextColor: "#ffffff",
      mediaPosition: "right",
      overlay: "none",
      align: "left",
    }),
    block("STATS", {
      eyebrow: "Career Snapshot",
      heading: "Experience across creative production and scalable systems.",
      layout: "strip",
      tone: "dark",
      columns: 4,
      align: "center",
      items: [
        { icon: "", value: "8+", label: "Years experience", description: "", trend: "", highlighted: true },
        { icon: "", value: "240+", label: "Projects completed", description: "", trend: "", highlighted: false },
        { icon: "", value: "35", label: "Automations shipped", description: "", trend: "", highlighted: false },
        { icon: "", value: "98.9%", label: "Satisfied collaborators", description: "", trend: "", highlighted: false },
      ],
    }),
    block("FEATURE_GRID", {
      eyebrow: "Skills & Tools",
      heading: "A hybrid toolkit for modern creative operations.",
      columns: 3,
      layout: "list",
      cardStyle: "outline",
      align: "left",
      iconStyle: "symbol",
      items: [
        { eyebrow: "ADVANCED", icon: "●", title: "Notion & Knowledge Systems", description: "Workspace architecture, documentation, team adoption, and governance.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "ADVANCED", icon: "●", title: "Adobe Creative Suite", description: "Premiere Pro, Photoshop, After Effects, and practical asset workflows.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "ADVANCED", icon: "●", title: "Spreadsheet Operations", description: "Structured data, reporting, planning models, and operational visibility.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "INTERMEDIATE", icon: "◐", title: "No-code Automation", description: "Make, Zapier, webhooks, forms, and connected workflows.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "INTERMEDIATE", icon: "◐", title: "Web & Prototyping", description: "HTML/CSS literacy, Webflow, structured prototypes, and handoff.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "WORKING KNOWLEDGE", icon: "◐", title: "Python", description: "Small utilities, data cleanup, API experiments, and workflow support.", imageUrl: "", imageAlt: "", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),
    block("STEPS", {
      eyebrow: "Experience",
      heading: "Roles where creative quality and operational clarity had to coexist.",
      layout: "timeline",
      tone: "light",
      columns: 3,
      align: "left",
      markerStyle: "dot",
      items: [
        { eyebrow: "2021 — PRESENT", icon: "", title: "Creative Systems Lead", description: "Design content operations, internal tools, automation, and reporting systems for a multi-brand organization.", meta: "Northstar Group", linkLabel: "", linkHref: "#", highlighted: true },
        { eyebrow: "2018 — 2021", icon: "", title: "Senior Content Producer", description: "Led cross-channel production, editorial workflows, post-production, and creative partner coordination.", meta: "Common Studio", linkLabel: "", linkHref: "#", highlighted: false },
        { eyebrow: "2016 — 2018", icon: "", title: "Digital Project Coordinator", description: "Supported website, campaign, event, and internal communication delivery across distributed teams.", meta: "Fieldwork Media", linkLabel: "", linkHref: "#", highlighted: false },
      ],
    }),
    block("COLUMNS", {
      heading: "Achievements",
      subheading: "Examples of visible outcomes, recognition, and internal impact.",
      columns: 3,
      gap: "md",
      align: "left",
      layout: "cards",
      cardStyle: "soft",
      verticalAlign: "stretch",
      items: [
        { eyebrow: "EFFICIENCY", icon: "↗", imageUrl: "", imageAlt: "", heading: "31% Faster Production", body: "<p>Redesigned intake, review, and asset handoff across five creative teams.</p>", meta: "2025", buttonLabel: "", buttonHref: "#", highlighted: true },
        { eyebrow: "RECOGNITION", icon: "★", imageUrl: "", imageAlt: "", heading: "Innovation Award", body: "<p>Recognized for a lightweight internal tool that improved project visibility.</p>", meta: "2024", buttonLabel: "", buttonHref: "#", highlighted: false },
        { eyebrow: "ENABLEMENT", icon: "◎", imageUrl: "", imageAlt: "", heading: "120 People Onboarded", body: "<p>Created documentation and workshops adopted across creative and commercial teams.</p>", meta: "2023 — 2025", buttonLabel: "", buttonHref: "#", highlighted: false },
      ],
    }),
    block("TESTIMONIAL", {
      eyebrow: "Colleague Notes",
      heading: "Known for making ambitious work feel more achievable.",
      layout: "grid",
      tone: "soft",
      columns: 2,
      align: "left",
      showQuotes: true,
      items: [
        { quote: "Albert can speak equally well with designers, operators, and engineers. He finds the shared problem and builds a practical path forward.", authorName: "Nina Patel", authorRole: "VP Product · Northstar Group", avatarUrl: "", logoUrl: "", rating: 5, highlighted: true },
        { quote: "He improves systems without flattening creativity. Our team shipped faster and felt more ownership over the process.", authorName: "Marcus Lee", authorRole: "Creative Director · Common Studio", avatarUrl: "", logoUrl: "", rating: 5, highlighted: false },
      ],
    }),
    block("CONTACT_FORM", {
      eyebrow: "Contact",
      heading: "Tell me what your team is trying to make possible.",
      description: "For creative technology roles, systems consulting, automation projects, and selected collaborations.",
      buttonLabel: "Send message",
      nameLabel: "Name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      companyLabel: "Company",
      companyPlaceholder: "Organization or team",
      subjectLabel: "Opportunity",
      subjectPlaceholder: "Role, consulting, or collaboration",
      messageLabel: "Context",
      messagePlaceholder: "Share the challenge, desired outcome, timing, and how I could help…",
      recipientEmail: "albert.creative@example.com",
      contactEmail: "albert.creative@example.com",
      contactAddress: "California, USA · Remote worldwide",
      responseTime: "Usually replies within 2 business days",
      layout: "split",
      tone: "light",
      width: "wide",
      buttonStyle: "solid",
      fieldStyle: "outline",
      submitMode: "mailto",
      showCompany: true,
      showSubject: true,
      showContactInfo: true,
      align: "left",
    }),
    block("FOOTER", {
      brand: "ALBERT / CREATIVE TECH",
      description: "Creative systems, useful automation, and thoughtful digital work.",
      copyright: "Albert Creative Resume. All rights reserved.",
      layout: "minimal",
      tone: "dark",
      width: "full",
      showBrand: true,
      showCopyright: true,
      showSocial: true,
      navItems: [{ label: "Experience", href: "#experience", description: "", badge: "" }, { label: "Achievements", href: "#achievements", description: "", badge: "" }],
      socialItems: [{ label: "LinkedIn", href: "https://linkedin.com", description: "", badge: "" }, { label: "Email", href: "mailto:albert.creative@example.com", description: "", badge: "" }],
    }),
  ], [
    { preset: "fade", duration: 0.35, distance: 0 },
    { preset: "reveal-up", duration: 0.75, distance: 42, parallax: 10 },
    { preset: "pop", duration: 0.5, distance: 0, easing: "spring" },
    { preset: "fade-left", duration: 0.6, distance: 34 },
    { preset: "fade-up", duration: 0.55, distance: 24 },
    { preset: "reveal-up", duration: 0.65, distance: 32 },
    { preset: "fade-right", duration: 0.6, distance: 34 },
    { preset: "fade-up", duration: 0.55, distance: 22 },
    { preset: "fade", duration: 0.4, distance: 0 },
  ]);
}
