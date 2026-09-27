import {
  BadgePercent,
  BarChart3,
  BellRing,
  Blocks,
  Brush,
  ClipboardList,
  Cloud,
  CreditCard,
  GitBranch,
  Globe2,
  GraduationCap,
  Handshake,
  ImageIcon,
  Inbox,
  Languages,
  LockKeyhole,
  Mail,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Newspaper,
  Package,
  PanelTop,
  Percent,
  Radio,
  Rocket,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  UserRoundCog,
  Users,
} from "lucide-react";

import { LANDING_CONTAINER } from "@/components/landing/site-chrome";
import {
  RevealOnScroll,
  Stagger,
  StaggerItem,
} from "@/components/ui/motion-primitives";

const primaryFeatures = [
  {
    icon: Cloud,
    title: "Tanpa repot urus hosting",
    body: "Publish langsung dengan hosting publik bawaan. Opsi self-host tetap tersedia saat kamu membutuhkannya.",
  },
  {
    icon: Blocks,
    title: "Bebas konflik plugin",
    body: "Semua fitur inti dibangun dalam satu platform, jadi kamu tidak perlu merawat tumpukan plugin terpisah.",
  },
  {
    icon: PanelTop,
    title: "Rich Page Builder",
    body: "Rancang halaman dengan blok fleksibel, preview responsif, dan pengaturan visual yang mudah diedit.",
  },
  {
    icon: Store,
    title: "Jualan apa saja",
    body: "Kelola produk fisik dan digital, stok, kategori, harga, keranjang, serta order dari satu dashboard.",
  },
  {
    icon: GraduationCap,
    title: "LMS & kelas online",
    body: "Susun course, modul, dan lesson; atur harga serta pantau progres belajar setiap peserta.",
  },
  {
    icon: LockKeyhole,
    title: "Membership system",
    body: "Bangun program membership bertingkat dan lindungi konten berdasarkan plan yang dimiliki member.",
  },
  {
    icon: Rocket,
    title: "Otomasi penjualan",
    body: "Pulihkan calon pembeli, buat follow-up, dan hubungkan aktivitas pelanggan ke alur kerja yang rapi.",
  },
  {
    icon: MousePointerClick,
    title: "High-converting checkout",
    body: "Alur cart dan checkout yang ringkas membantu pelanggan menyelesaikan pembelian tanpa banyak hambatan.",
  },
  {
    icon: Percent,
    title: "Robust discount system",
    body: "Buat kupon nominal atau persentase, atur target produk, periode aktif, dan batas pemakaiannya.",
  },
  {
    icon: ClipboardList,
    title: "Multi-purpose form builder",
    body: "Buat form lead, kontak, survei, hingga order dengan tipe field dan validasi yang fleksibel.",
  },
  {
    icon: ImageIcon,
    title: "Media siap tampil",
    body: "Kelola gambar produk, cover course, artikel, dan konten halaman agar tetap konsisten di setiap perangkat.",
  },
  {
    icon: CreditCard,
    title: "Payment gateway",
    body: "Terima pembayaran online melalui Midtrans atau sediakan pembayaran manual sesuai kebutuhan bisnis.",
  },
  {
    icon: Languages,
    title: "Sistem multi-bahasa",
    body: "Sesuaikan bahasa workspace dan pengalaman publik untuk audiens yang lebih luas.",
  },
  {
    icon: Megaphone,
    title: "Marketing booster",
    body: "Gabungkan kupon, afiliasi, analytics, Meta CAPI, dan kampanye follow-up dalam satu alur.",
  },
  {
    icon: Share2,
    title: "Integrasi aplikasi lain",
    body: "Hubungkan Gmail, WhatsApp, Telegram, Mailketing, Meta, dan layanan operasional lain dari dashboard.",
  },
];

const allFeatures = [
  { icon: PanelTop, title: "Page Builder", body: "Landing page berbasis blok tanpa coding." },
  { icon: Brush, title: "Theme & Branding", body: "Warna, logo, tipografi, dan identitas brand." },
  { icon: Globe2, title: "Custom Domain", body: "Gunakan domain sendiri untuk website publik." },
  { icon: Package, title: "Product & Store", body: "Produk fisik, digital, kategori, dan stok." },
  { icon: CreditCard, title: "Checkout & Payment", body: "Checkout terintegrasi dengan status pembayaran." },
  { icon: ShoppingCart, title: "Cart & Order", body: "Keranjang, order, dan pengelolaan transaksi." },
  { icon: BadgePercent, title: "Coupon & Discount", body: "Diskon fleksibel untuk produk dan campaign." },
  { icon: GraduationCap, title: "LMS / eCourse", body: "Course, modul, lesson, dan progres peserta." },
  { icon: ShieldCheck, title: "Membership", body: "Plan member dan proteksi konten premium." },
  { icon: Newspaper, title: "Blog & Article CMS", body: "Artikel, kategori, SEO, dan publikasi konten." },
  { icon: ClipboardList, title: "Form Builder", body: "Form custom dengan submission terpusat." },
  { icon: Inbox, title: "Inbox & Submission", body: "Kelola lead dan pesan dalam satu tempat." },
  { icon: Handshake, title: "Affiliate Program", body: "Referral, komisi, dan partner penjualan." },
  { icon: GitBranch, title: "Sales Funnel", body: "Susun perjalanan pelanggan menuju konversi." },
  { icon: RotateCcw, title: "Cart Recovery", body: "Pulihkan transaksi yang belum diselesaikan." },
  { icon: BellRing, title: "Follow-up Automation", body: "Jadwalkan tindak lanjut pelanggan otomatis." },
  { icon: Users, title: "Customer Management", body: "Data pelanggan, aktivitas, dan histori order." },
  { icon: BarChart3, title: "Analytics", body: "Traffic, penjualan, revenue, dan performa konten." },
  { icon: UserRoundCog, title: "Team & Roles", body: "Undang tim dengan hak akses terkontrol." },
  { icon: Radio, title: "Meta CAPI", body: "Tracking event iklan melalui Conversion API." },
  { icon: Mail, title: "Gmail & Email", body: "Kirim email operasional dari integrasi workspace." },
  { icon: MessageCircle, title: "WhatsApp Integration", body: "Notifikasi dan komunikasi lewat WhatsApp." },
  { icon: Send, title: "Telegram Notification", body: "Kirim event penting ke chat Telegram." },
  { icon: Truck, title: "Shipping & RajaOngkir", body: "Ongkir otomatis dan pilihan layanan ekspedisi." },
];

// The six that carry the pitch; the rest live in the compact list below.
const HIGHLIGHTED = [
  "Rich Page Builder",
  "Jualan apa saja",
  "LMS & kelas online",
  "Membership system",
  "Payment gateway",
  "Marketing booster",
];

export function FeatureShowcase() {
  const highlights = HIGHLIGHTED.map((title) => primaryFeatures.find((f) => f.title === title)!).filter(Boolean);

  return (
    <section id="fitur" className="scroll-mt-[72px] py-[64px] sm:py-[88px]">
      <div className={LANDING_CONTAINER}>
        <RevealOnScroll>
          <div className="mx-auto max-w-[560px] text-center">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-kv-muted-fg">Fitur</p>
            <h2 className="mt-[10px] text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-kv-fg sm:text-[34px]">
              Satu platform, lebih sedikit kerumitan.
            </h2>
            <p className="mt-[12px] text-[14px] leading-[1.6] text-kv-muted-fg">
              Semua fitur inti sudah menyatu — tanpa plugin, tanpa tumpukan tool terpisah.
            </p>
          </div>
        </RevealOnScroll>

        <Stagger className="mt-[36px] grid gap-[12px] sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((feature) => {
            const Icon = feature.icon;
            return (
              <StaggerItem key={feature.title} className="h-full">
                <article className="kv-frame group flex h-full flex-col p-[4px]">
                  <div className="flex items-center justify-between gap-[8px] px-[8px] py-[6px]">
                    <h3 className="text-[13px] font-medium leading-none text-kv-secondary-fg">{feature.title}</h3>
                    <Icon
                      className="h-[16px] w-[16px] text-kv-secondary-fg transition-transform duration-300 ease-out-expo group-hover:-rotate-12 group-hover:scale-110"
                      strokeWidth={1.6}
                    />
                  </div>
                  <p className="flex-1 rounded-[10px] border-[0.8px] border-kv-border bg-kv-card px-[14px] py-[14px] text-[13px] leading-[1.6] text-kv-muted-fg transition-[box-shadow,transform] duration-300 ease-out-expo group-hover:-translate-y-px group-hover:shadow-kv-hover">
                    {feature.body}
                  </p>
                </article>
              </StaggerItem>
            );
          })}
        </Stagger>

        <RevealOnScroll>
          <div className="mt-[40px] text-center">
            <p className="text-[13px] text-kv-muted-fg">Dan masih banyak lagi</p>
            <ul className="mx-auto mt-[14px] flex max-w-[900px] flex-wrap justify-center gap-[6px]">
              {allFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li
                    key={feature.title}
                    title={feature.body}
                    className="inline-flex h-[28px] items-center gap-[6px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[12px] font-medium leading-none text-kv-secondary-fg"
                  >
                    <Icon className="h-[13px] w-[13px] text-kv-muted-fg" strokeWidth={1.6} />
                    {feature.title}
                  </li>
                );
              })}
            </ul>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
