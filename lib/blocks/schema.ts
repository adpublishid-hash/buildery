import { z } from "zod";

import { blockAnimationSchema } from "./animation";

// ============================================================
// Block data schemas
//
// Every field has a default so that partial or legacy data stored
// in PageBlock.data still parses into a complete object.
// ============================================================

const align = z.enum(["left", "center"]).default("center");
const str = (d = "") => z.string().default(d);

const blockStyleFields = {
  visibility: z
    .enum(["all", "desktop", "tablet", "mobile", "desktop-tablet", "tablet-mobile"])
    .default("all"),
  paddingY: z.enum(["default", "none", "sm", "lg", "xl"]).default("default"),
  paddingX: z.enum(["default", "none", "sm", "lg"]).default("default"),
  marginY: z.enum(["none", "sm", "md", "lg"]).default("none"),
  paddingYValue: z.number().min(0).max(200).optional(),
  paddingXValue: z.number().min(0).max(160).optional(),
  marginYValue: z.number().min(0).max(160).optional(),
  backgroundColor: str(),
  textColor: str(),
  fontFamily: z
    .enum(["default", "sans", "serif", "mono", "display"])
    .default("default"),
  headingSize: z
    .enum(["default", "sm", "md", "lg", "xl", "2xl"])
    .default("default"),
  bodySize: z.enum(["default", "sm", "md", "lg"]).default("default"),
  borderRadius: z.enum(["none", "sm", "md", "lg", "xl"]).default("none"),
  headingSizeValue: z.number().min(0).max(120).optional(),
  bodySizeValue: z.number().min(0).max(64).optional(),
  borderRadiusValue: z.number().min(0).max(80).optional(),
  border: z.enum(["none", "sm", "md"]).default("none"),
  borderColor: str(),
  shadow: z.enum(["none", "sm", "md", "lg", "xl"]).default("none"),
  textAlign: z.enum(["default", "left", "center", "right"]).default("default"),
};

const blockDeviceStyleSchema = z.object(blockStyleFields).partial().default({});

export const blockStyleSchema = z.object({
  ...blockStyleFields,
  tablet: blockDeviceStyleSchema,
  mobile: blockDeviceStyleSchema,
});

const withStyle = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({
    style: blockStyleSchema.default({}),
    // Named `motion` rather than `animation` because BUTTON blocks already
    // carry their own per-button `animation` field.
    motion: blockAnimationSchema.default({}),
  });

const heroStatItemSchema = z.object({
  value: str("100+"),
  label: str("Happy customers"),
});

export const heroDataSchema = withStyle(z.object({
  eyebrow: str(),
  badge: str(),
  heading: str("Build something people love"),
  subheading: str(
    "A clean, fast landing page - assembled from blocks, published in minutes."
  ),
  primaryLabel: str("Get started"),
  primaryHref: str("#"),
  secondaryLabel: str("Learn more"),
  secondaryHref: str("#"),
  mediaUrl: str(),
  mediaAlt: str(),
  mediaCaption: str(),
  videoUrl: str(),
  trustText: str(),
  stats: z.array(heroStatItemSchema).default([]),
  layout: z.enum(["centered", "split", "media-top", "background", "card"]).default("centered"),
  height: z.enum(["compact", "normal", "full"]).default("normal"),
  buttonStyle: z.enum(["solid", "soft", "outline"]).default("solid"),
  buttonColor: str(),
  buttonTextColor: str(),
  mediaPosition: z.enum(["right", "left"]).default("right"),
  overlay: z.enum(["none", "light", "dark"]).default("dark"),
  align,
}));

export const textDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str(),
  subheading: str(),
  body: str(
    "Write your story here. Keep it short, specific, and easy to scan."
  ),
  buttonLabel: str(),
  buttonHref: str("#"),
  attribution: str(),
  imageUrl: str(),
  imageAlt: str(),
  imagePosition: z.enum(["none", "top", "left", "right"]).default("none"),
  layout: z.enum(["narrow", "wide", "split", "callout", "quote"]).default("narrow"),
  tone: z.enum(["plain", "soft", "bordered", "accent"]).default("plain"),
  align,
}));

export const customHtmlDataSchema = withStyle(z.object({
  name: z.string().max(120).default("Imported HTML"),
  html: z.string().max(1_000_000).default(
    '<div style="padding: 48px; text-align: center"><h1>Custom HTML</h1><p>Paste HTML, CSS, and JavaScript in the settings panel.</p></div>'
  ),
  baseUrl: z.string().max(2048).default(""),
  height: z.number().int().min(100).max(4000).default(500),
  autoHeight: z.boolean().default(true),
  allowScripts: z.boolean().default(false),
  allowForms: z.boolean().default(false),
  allowModals: z.boolean().default(false),
  allowPopups: z.boolean().default(false),
  allowDownloads: z.boolean().default(false),
  allowPresentation: z.boolean().default(false),
}));

export const columnItemSchema = z.object({
  eyebrow: str(),
  icon: str(),
  imageUrl: str(),
  imageAlt: str(),
  heading: str("Column title"),
  body: str("<p>Use this column to explain a feature, benefit, or offer.</p>"),
  meta: str(),
  buttonLabel: str(),
  buttonHref: str("#"),
  highlighted: z.boolean().default(false),
});

export const columnsDataSchema = withStyle(z.object({
  heading: str("Section heading"),
  subheading: str(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
  gap: z.enum(["sm", "md", "lg"]).default("md"),
  align,
  layout: z.enum(["cards", "plain", "media", "numbered", "timeline"]).default("cards"),
  cardStyle: z.enum(["outline", "soft", "elevated"]).default("outline"),
  verticalAlign: z.enum(["top", "center", "stretch"]).default("stretch"),
  items: z.array(columnItemSchema).default([
    {
      eyebrow: "",
      icon: "",
      imageUrl: "",
      imageAlt: "",
      heading: "First column",
      body: "<p>Add supporting copy for this column.</p>",
      meta: "",
      buttonLabel: "",
      buttonHref: "#",
      highlighted: false,
    },
    {
      eyebrow: "",
      icon: "",
      imageUrl: "",
      imageAlt: "",
      heading: "Second column",
      body: "<p>Add supporting copy for this column.</p>",
      meta: "",
      buttonLabel: "",
      buttonHref: "#",
      highlighted: false,
    },
  ]),
}));

export const imageDataSchema = withStyle(z.object({
  url: str("/templates/1517694712202-14dd9538aa-7857ab60.jpg"),
  alt: str("Descriptive alt text"),
  eyebrow: str(),
  title: str(),
  description: str(),
  caption: str(),
  linkHref: str(),
  width: z.enum(["narrow", "wide", "full", "bleed"]).default("wide"),
  aspectRatio: z.enum(["auto", "video", "square", "portrait", "wide"]).default("auto"),
  objectFit: z.enum(["cover", "contain"]).default("cover"),
  frame: z.enum(["none", "rounded", "border", "shadow", "browser"]).default("rounded"),
  captionPosition: z.enum(["below", "overlay", "none"]).default("below"),
  align: z.enum(["left", "center", "right"]).default("center"),
  rounded: z.boolean().default(true),
  lightbox: z.boolean().default(false),
}));

export const ctaDataSchema = withStyle(z.object({
  eyebrow: str(),
  badge: str(),
  heading: str("Ready to get started?"),
  description: str("Join thousands of teams building with My Landing."),
  buttonLabel: str("Start free"),
  buttonHref: str("#"),
  secondaryLabel: str(),
  secondaryHref: str("#"),
  note: str(),
  imageUrl: str(),
  imageAlt: str(),
  layout: z.enum(["card", "split", "banner", "background", "minimal"]).default("card"),
  tone: z.enum(["soft", "dark", "light", "accent"]).default("soft"),
  buttonStyle: z.enum(["solid", "soft", "outline"]).default("solid"),
  buttonColor: str(),
  buttonTextColor: str(),
  imagePosition: z.enum(["right", "left"]).default("right"),
  height: z.enum(["compact", "normal", "large"]).default("normal"),
  overlay: z.enum(["none", "light", "dark"]).default("dark"),
  align,
}));

export const featureItemSchema = z.object({
  eyebrow: str(),
  icon: str(),
  title: str("Feature title"),
  description: str("A short description of why this feature matters."),
  imageUrl: str(),
  imageAlt: str(),
  linkLabel: str(),
  linkHref: str("#"),
  highlighted: z.boolean().default(false),
});

export const featureGridDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Everything you need"),
  subheading: str("A focused set of tools, nothing you don't."),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  layout: z.enum(["cards", "icons", "media", "minimal", "list"]).default("cards"),
  cardStyle: z.enum(["outline", "soft", "elevated"]).default("outline"),
  align: z.enum(["left", "center"]).default("center"),
  iconStyle: z.enum(["number", "symbol", "accent"]).default("number"),
  items: z
    .array(featureItemSchema)
    .default([
      {
        eyebrow: "",
        icon: "",
        title: "Fast",
        description: "Pages load instantly for every visitor.",
        imageUrl: "",
        imageAlt: "",
        linkLabel: "",
        linkHref: "#",
        highlighted: false,
      },
      {
        eyebrow: "",
        icon: "",
        title: "Flexible",
        description: "Compose layouts from simple blocks.",
        imageUrl: "",
        imageAlt: "",
        linkLabel: "",
        linkHref: "#",
        highlighted: false,
      },
      {
        eyebrow: "",
        icon: "",
        title: "Yours",
        description: "Self-hosted on your own VPS.",
        imageUrl: "",
        imageAlt: "",
        linkLabel: "",
        linkHref: "#",
        highlighted: false,
      },
    ]),
}));

export const statItemSchema = z.object({
  icon: str(),
  value: str("99%"),
  label: str("Uptime"),
  description: str(),
  trend: str(),
  highlighted: z.boolean().default(false),
});

export const statsDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Trusted by teams everywhere"),
  subheading: str(),
  layout: z.enum(["cards", "strip", "split", "minimal", "inline"]).default("cards"),
  tone: z.enum(["light", "soft", "dark", "accent"]).default("light"),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
  align: z.enum(["left", "center"]).default("center"),
  items: z
    .array(statItemSchema)
    .default([
      { icon: "", value: "12K+", label: "Active users", description: "", trend: "", highlighted: false },
      { icon: "", value: "99.9%", label: "Uptime", description: "", trend: "", highlighted: false },
      { icon: "", value: "4.9/5", label: "Customer rating", description: "", trend: "", highlighted: false },
      { icon: "", value: "24/7", label: "Support", description: "", trend: "", highlighted: false },
    ]),
}));

export const stepItemSchema = z.object({
  eyebrow: str(),
  icon: str(),
  title: str("Step title"),
  description: str("Explain what happens in this step."),
  meta: str(),
  linkLabel: str(),
  linkHref: str("#"),
  highlighted: z.boolean().default(false),
});

export const stepsDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("How it works"),
  subheading: str("Up and running in three simple steps."),
  layout: z.enum(["horizontal", "vertical", "cards", "timeline", "plain"]).default("horizontal"),
  tone: z.enum(["light", "soft", "dark"]).default("light"),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  align: z.enum(["left", "center"]).default("center"),
  markerStyle: z.enum(["number", "icon", "dot"]).default("number"),
  items: z
    .array(stepItemSchema)
    .default([
      {
        eyebrow: "",
        icon: "",
        title: "Sign up",
        description: "Create your free account in seconds.",
        meta: "",
        linkLabel: "",
        linkHref: "#",
        highlighted: false,
      },
      {
        eyebrow: "",
        icon: "",
        title: "Build",
        description: "Assemble your page from ready-made blocks.",
        meta: "",
        linkLabel: "",
        linkHref: "#",
        highlighted: false,
      },
      {
        eyebrow: "",
        icon: "",
        title: "Publish",
        description: "Go live with one click - no code needed.",
        meta: "",
        linkLabel: "",
        linkHref: "#",
        highlighted: false,
      },
    ]),
}));

export const pricingPlanSchema = z.object({
  badge: str(),
  name: str("Starter"),
  price: str("$0"),
  period: str("/mo"),
  description: str("For trying things out."),
  features: z.array(z.string()).default(["1 website", "Community support"]),
  excludedFeatures: z.array(z.string()).default([]),
  note: str(),
  highlighted: z.boolean().default(false),
  ctaLabel: str("Choose plan"),
  ctaHref: str("#"),
  secondaryLabel: str(),
  secondaryHref: str("#"),
});

export const pricingDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Simple, honest pricing"),
  subheading: str("Pick a plan that fits. Upgrade any time."),
  billingNote: str(),
  layout: z.enum(["cards", "compact", "featured", "minimal"]).default("cards"),
  tone: z.enum(["light", "soft", "dark"]).default("light"),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  align: z.enum(["left", "center"]).default("center"),
  plans: z
    .array(pricingPlanSchema)
    .default([
      {
        badge: "",
        name: "Starter",
        price: "$0",
        period: "/mo",
        description: "For trying things out.",
        features: ["1 website", "My Landing subdomain", "Community support"],
        excludedFeatures: [],
        note: "",
        highlighted: false,
        ctaLabel: "Get started",
        ctaHref: "#",
        secondaryLabel: "",
        secondaryHref: "#",
      },
      {
        badge: "Most popular",
        name: "Pro",
        price: "$19",
        period: "/mo",
        description: "For growing businesses.",
        features: ["10 websites", "Custom domain", "Priority support"],
        excludedFeatures: [],
        note: "",
        highlighted: true,
        ctaLabel: "Start Pro",
        ctaHref: "#",
        secondaryLabel: "",
        secondaryHref: "#",
      },
      {
        badge: "",
        name: "Scale",
        price: "$49",
        period: "/mo",
        description: "For teams that ship.",
        features: ["Unlimited websites", "Team members", "Analytics"],
        excludedFeatures: [],
        note: "",
        highlighted: false,
        ctaLabel: "Contact sales",
        ctaHref: "#",
        secondaryLabel: "",
        secondaryHref: "#",
      },
    ]),
}));

export const testimonialItemSchema = z.object({
  quote: str(
    "My Landing helped us launch our landing page in an afternoon - no developer needed."
  ),
  authorName: str("Sarah Lee"),
  authorRole: str("Founder, Acme Studio"),
  avatarUrl: str(),
  logoUrl: str(),
  rating: z.number().int().min(0).max(5).default(5),
  highlighted: z.boolean().default(false),
});

export const testimonialDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str(),
  subheading: str(),
  quote: str(
    "My Landing helped us launch our landing page in an afternoon - no developer needed."
  ),
  authorName: str("Sarah Lee"),
  authorRole: str("Founder, Acme Studio"),
  avatarUrl: str(),
  logoUrl: str(),
  rating: z.number().int().min(0).max(5).default(5),
  layout: z.enum(["single", "card", "split", "grid", "scroll"]).default("single"),
  tone: z.enum(["light", "soft", "dark"]).default("light"),
  columns: z.union([z.literal(2), z.literal(3)]).default(3),
  align: z.enum(["left", "center"]).default("center"),
  showQuotes: z.boolean().default(true),
  items: z.array(testimonialItemSchema).default([]),
}));

export const logoItemSchema = z.object({
  name: str("Company"),
  url: str(),
  href: str(),
  category: str(),
  featured: z.boolean().default(false),
});

export const logosDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Powering teams at"),
  subheading: str(),
  layout: z.enum(["cloud", "grid", "cards", "strip", "plain"]).default("cloud"),
  tone: z.enum(["light", "soft", "dark"]).default("light"),
  columns: z.union([z.literal(3), z.literal(4), z.literal(5)]).default(5),
  logoSize: z.enum(["sm", "md", "lg"]).default("md"),
  align: z.enum(["left", "center"]).default("center"),
  grayscale: z.boolean().default(true),
  items: z
    .array(logoItemSchema)
    .default([
      { name: "Acme", url: "", href: "", category: "", featured: false },
      { name: "Globex", url: "", href: "", category: "", featured: false },
      { name: "Initech", url: "", href: "", category: "", featured: false },
      { name: "Umbrella", url: "", href: "", category: "", featured: false },
      { name: "Soylent", url: "", href: "", category: "", featured: false },
    ]),
}));

export const galleryItemSchema = z.object({
  url: str("/templates/1517694712202-14dd9538aa-7857ab60.jpg"),
  alt: str("Gallery image"),
  title: str(),
  caption: str(),
  href: str(),
  featured: z.boolean().default(false),
});

export const galleryDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Gallery"),
  subheading: str(),
  layout: z.enum(["grid", "masonry", "featured", "strip"]).default("grid"),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  gap: z.enum(["sm", "md", "lg"]).default("md"),
  aspectRatio: z.enum(["auto", "video", "square", "portrait", "wide"]).default("video"),
  frame: z.enum(["none", "rounded", "border", "shadow"]).default("rounded"),
  captionPosition: z.enum(["none", "below", "overlay"]).default("overlay"),
  hoverEffect: z.enum(["none", "zoom", "lift"]).default("zoom"),
  lightbox: z.boolean().default(false),
  align,
  items: z
    .array(galleryItemSchema)
    .default([
      {
        url: "/templates/1517694712202-14dd9538aa-7857ab60.jpg",
        alt: "Gallery image",
        title: "Workspace",
        caption: "A clean space for focused work.",
        href: "",
        featured: true,
      },
      {
        url: "/templates/1522202176988-66273c2fd5-b4a4625a.jpg",
        alt: "Gallery image",
        title: "Team",
        caption: "Moments from the people behind the project.",
        href: "",
        featured: false,
      },
      {
        url: "/templates/1496171367470-9ed9a91ea9-37bb0539.jpg",
        alt: "Gallery image",
        title: "Launch",
        caption: "Details that make the experience feel polished.",
        href: "",
        featured: false,
      },
    ]),
}));

export const imageSliderItemSchema = z.object({
  url: str("/templates/1517694712202-14dd9538aa-7857ab60.jpg"),
  alt: str("Slide image"),
  caption: str(),
  href: str(),
});

export const imageSliderDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str(),
  subheading: str(),
  aspectRatio: z
    .enum(["wide", "video", "cinema", "square", "portrait", "auto"])
    .default("wide"),
  fit: z.enum(["cover", "contain"]).default("cover"),
  frame: z.enum(["none", "rounded", "shadow"]).default("rounded"),
  autoplay: z.boolean().default(true),
  intervalSec: z.number().min(2).max(15).default(5),
  loop: z.boolean().default(true),
  showArrows: z.boolean().default(true),
  showDots: z.boolean().default(true),
  showCaption: z.boolean().default(true),
  align,
  items: z
    .array(imageSliderItemSchema)
    .default([
      {
        url: "/templates/1517694712202-14dd9538aa-7857ab60.jpg",
        alt: "Slide image",
        caption: "Slide pertama — ganti gambar & teks ini.",
        href: "",
      },
      {
        url: "/templates/1522202176988-66273c2fd5-b4a4625a.jpg",
        alt: "Slide image",
        caption: "Slide kedua.",
        href: "",
      },
      {
        url: "/templates/1496171367470-9ed9a91ea9-37bb0539.jpg",
        alt: "Slide image",
        caption: "Slide ketiga.",
        href: "",
      },
    ]),
}));

export const countdownDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Penawaran berakhir dalam"),
  subheading: str(),
  targetDate: str(""),
  layout: z.enum(["cards", "compact", "minimal"]).default("cards"),
  tone: z.enum(["light", "soft", "dark", "accent"]).default("light"),
  showLabels: z.boolean().default(true),
  showSeconds: z.boolean().default(true),
  expiredMessage: str("Waktu habis."),
  ctaLabel: str(),
  ctaHref: str("#"),
  labelDays: str("Hari"),
  labelHours: str("Jam"),
  labelMinutes: str("Menit"),
  labelSeconds: str("Detik"),
  align,
}));

/**
 * Tombol WhatsApp yang menempel di pojok layar.
 *
 * Nomor disimpan terpisah dari tautannya supaya pemilik situs cukup mengetik
 * nomornya, dan supaya audit serta penjaga penerbitan bisa memeriksanya.
 */
export const whatsappFloatDataSchema = withStyle(z.object({
  phone: str(),
  message: str("Halo, saya tertarik dengan produk Anda."),
  label: str("Chat via WhatsApp"),
  showLabel: z.boolean().default(true),
  position: z.enum(["right", "left"]).default("right"),
  /** Tampilkan sedikit setelah halaman dimuat, supaya tidak menutupi hero. */
  delaySeconds: z.number().int().min(0).max(30).default(0),
}));

/** Peta lokasi lewat embed Google Maps — tanpa API key. */
export const mapDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Kunjungi kami"),
  description: str(),
  address: str(),
  /** Alamat atau "lat,lng" untuk pin peta. Kosong berarti memakai alamat. */
  query: str(),
  zoom: z.number().int().min(3).max(20).default(15),
  height: z.enum(["sm", "md", "lg"]).default("md"),
  layout: z.enum(["stacked", "split"]).default("split"),
  showDirections: z.boolean().default(true),
  directionsLabel: str("Petunjuk arah"),
  openingHours: str(),
  phone: str(),
  align,
}));

export const tabItemSchema = z.object({
  label: str("Tab"),
  heading: str(),
  body: str(),
  imageUrl: str(),
  imageAlt: str(),
  ctaLabel: str(),
  ctaHref: str("#"),
});

export const tabsDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Pilih yang sesuai"),
  subheading: str(),
  variant: z.enum(["pills", "underline", "boxed"]).default("pills"),
  tabs: z
    .array(tabItemSchema)
    .max(8)
    .default([
      { label: "Pemula", heading: "Untuk yang baru mulai", body: "Jelaskan manfaat utama untuk kelompok ini.", imageUrl: "", imageAlt: "", ctaLabel: "", ctaHref: "#" },
      { label: "Bisnis", heading: "Untuk bisnis yang sedang tumbuh", body: "Jelaskan manfaat utama untuk kelompok ini.", imageUrl: "", imageAlt: "", ctaLabel: "", ctaHref: "#" },
    ]),
  align,
}));

export const comparisonColumnSchema = z.object({
  name: str("Plan"),
  description: str(),
  badge: str(),
  ctaLabel: str(),
  ctaHref: str("#"),
  highlighted: z.boolean().default(false),
});

export const comparisonRowSchema = z.object({
  feature: str("Feature"),
  description: str(),
  values: z.array(str()).default([]),
});

export const comparisonTableDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Bandingkan paket"),
  subheading: str(),
  layout: z.enum(["table", "cards"]).default("table"),
  tone: z.enum(["light", "soft"]).default("light"),
  showCta: z.boolean().default(true),
  align: z.enum(["left", "center"]).default("center"),
  columns: z.array(comparisonColumnSchema).default([
    { name: "Starter", description: "Untuk mulai.", badge: "", ctaLabel: "Pilih", ctaHref: "#", highlighted: false },
    { name: "Pro", description: "Untuk pertumbuhan.", badge: "Populer", ctaLabel: "Pilih", ctaHref: "#", highlighted: true },
    { name: "Scale", description: "Untuk tim besar.", badge: "", ctaLabel: "Hubungi", ctaHref: "#", highlighted: false },
  ]),
  rows: z.array(comparisonRowSchema).default([
    { feature: "Halaman tanpa batas", description: "", values: ["✓", "✓", "✓"] },
    { feature: "Custom domain", description: "", values: ["—", "✓", "✓"] },
    { feature: "Tim & kolaborasi", description: "", values: ["—", "—", "✓"] },
    { feature: "Analytics lanjutan", description: "", values: ["—", "✓", "✓"] },
    { feature: "Support prioritas", description: "", values: ["—", "Email", "Telepon"] },
  ]),
}));

export const marqueeItemSchema = z.object({
  text: str("Item teks"),
  icon: str(),
  href: str(),
});

export const marqueeDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str(),
  subheading: str(),
  direction: z.enum(["left", "right"]).default("left"),
  speed: z.enum(["slow", "normal", "fast"]).default("normal"),
  separator: z.enum(["dot", "dash", "none"]).default("dot"),
  size: z.enum(["sm", "md", "lg"]).default("md"),
  tone: z.enum(["light", "soft", "dark", "accent"]).default("light"),
  pauseOnHover: z.boolean().default(true),
  align,
  items: z.array(marqueeItemSchema).default([
    { text: "Pengiriman cepat", icon: "🚚", href: "" },
    { text: "Garansi 30 hari", icon: "✓", href: "" },
    { text: "Support 24/7", icon: "💬", href: "" },
    { text: "Diskon hari ini", icon: "🔥", href: "" },
    { text: "Pembayaran aman", icon: "🔒", href: "" },
  ]),
}));

export const videoDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Watch the demo"),
  subheading: str(),
  // Dulu default-nya "Never Gonna Give You Up": blok Video yang lupa diganti
  // memutarnya ke pengunjung halaman yang sudah terbit.
  url: str(),
  posterUrl: str(),
  posterAlt: str(),
  caption: str(),
  transcript: str(),
  buttonLabel: str(),
  buttonHref: str("#"),
  layout: z.enum(["centered", "split", "card", "full"]).default("centered"),
  width: z.enum(["narrow", "wide", "full", "bleed"]).default("wide"),
  aspectRatio: z.enum(["video", "square", "portrait", "wide"]).default("video"),
  frame: z.enum(["none", "rounded", "border", "shadow", "browser"]).default("rounded"),
  captionPosition: z.enum(["below", "overlay", "none"]).default("below"),
  videoFit: z.enum(["cover", "contain"]).default("cover"),
  autoplay: z.boolean().default(false),
  muted: z.boolean().default(false),
  loop: z.boolean().default(false),
  controls: z.boolean().default(true),
  align,
}));

export const faqItemSchema = z.object({
  question: str("Frequently asked question"),
  answer: str("A clear, concise answer to the question above."),
  category: str(),
  anchor: str(),
  icon: str(),
  highlighted: z.boolean().default(false),
  defaultOpen: z.boolean().default(false),
});

export const faqDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Frequently asked questions"),
  subheading: str(),
  layout: z.enum(["single", "two-column", "split", "cards", "grid"]).default("single"),
  tone: z.enum(["plain", "soft", "bordered", "accent"]).default("plain"),
  iconStyle: z.enum(["plus", "chevron", "number", "none"]).default("plus"),
  answerStyle: z.enum(["plain", "rich"]).default("plain"),
  showCategories: z.boolean().default(false),
  allowMultipleOpen: z.boolean().default(true),
  searchPlaceholder: str(),
  ctaLabel: str(),
  ctaHref: str("#"),
  ctaText: str(),
  align,
  items: z
    .array(faqItemSchema)
    .default([
      {
        question: "Can I use my own domain?",
        answer: "Yes - connect any custom domain from workspace settings.",
        category: "Setup",
        anchor: "",
        icon: "",
        highlighted: true,
        defaultOpen: true,
      },
      {
        question: "Is my data mine?",
        answer: "Always. My Landing runs on your own VPS and database.",
        category: "Ownership",
        anchor: "",
        icon: "",
        highlighted: false,
        defaultOpen: false,
      },
    ]),
}));

export const newsletterDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Stay in the loop"),
  description: str("Get product updates and tips. No spam, unsubscribe anytime."),
  buttonLabel: str("Subscribe"),
  placeholder: str("Enter your email"),
  namePlaceholder: str("Your name"),
  successMessage: str("Thanks - you're on the list."),
  note: str("No spam. Unsubscribe anytime."),
  privacyText: str(),
  consentLabel: str(),
  imageUrl: str(),
  imageAlt: str(),
  secondaryLabel: str(),
  secondaryHref: str("#"),
  formAction: str(),
  provider: z.enum(["internal", "mailchimp", "convertkit", "custom"]).default("internal"),
  layout: z.enum(["card", "split", "banner", "minimal", "inline"]).default("card"),
  tone: z.enum(["soft", "light", "dark", "accent"]).default("soft"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  buttonStyle: z.enum(["solid", "soft", "outline"]).default("solid"),
  fields: z.enum(["email", "name-email"]).default("email"),
  showConsent: z.boolean().default(false),
  compact: z.boolean().default(false),
  align,
}));

export const bannerDataSchema = withStyle(z.object({
  eyebrow: str(),
  badge: str("New"),
  icon: str(),
  heading: str(),
  text: str("New: launch your store in minutes - try it free."),
  linkLabel: str("Learn more"),
  linkHref: str("#"),
  secondaryLabel: str(),
  secondaryHref: str("#"),
  dismissLabel: str(),
  layout: z.enum(["bar", "card", "inline", "split", "ribbon"]).default("bar"),
  tone: z.enum(["accent", "dark", "light", "soft", "success", "warning"]).default("accent"),
  width: z.enum(["narrow", "wide", "full", "bleed"]).default("wide"),
  align,
  compact: z.boolean().default(false),
  showIcon: z.boolean().default(true),
}));

export const contactFormDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Get in touch"),
  description: str("Send us a message and we'll get back to you shortly."),
  buttonLabel: str("Send message"),
  successMessage: str("Thanks - we'll get back to you soon."),
  nameLabel: str("Name"),
  namePlaceholder: str("Jane Doe"),
  emailLabel: str("Email"),
  emailPlaceholder: str("jane@example.com"),
  phoneLabel: str("Phone"),
  phonePlaceholder: str("+1 555 000 0000"),
  companyLabel: str("Company"),
  companyPlaceholder: str("Acme Inc."),
  subjectLabel: str("Subject"),
  subjectPlaceholder: str("How can we help?"),
  messageLabel: str("Message"),
  messagePlaceholder: str("Tell us a little about what you need."),
  consentLabel: str(),
  privacyText: str(),
  formAction: str(),
  recipientEmail: str(),
  contactEmail: str(),
  contactPhone: str(),
  contactAddress: str(),
  responseTime: str("Usually replies within 1 business day"),
  layout: z.enum(["card", "split", "stacked", "minimal"]).default("card"),
  tone: z.enum(["light", "soft", "dark", "accent"]).default("light"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  buttonStyle: z.enum(["solid", "soft", "outline"]).default("solid"),
  fieldStyle: z.enum(["outline", "filled", "underline"]).default("outline"),
  submitMode: z.enum(["disabled", "external", "mailto"]).default("disabled"),
  showPhone: z.boolean().default(false),
  showCompany: z.boolean().default(false),
  showSubject: z.boolean().default(false),
  showConsent: z.boolean().default(false),
  showContactInfo: z.boolean().default(true),
  compact: z.boolean().default(false),
  align,
}));

export const embeddedFormFieldSchema = z.object({
  id: str(),
  label: str("Field"),
  name: str("field"),
  type: z.enum([
    "TEXT",
    "EMAIL",
    "PHONE",
    "NUMBER",
    "URL",
    "DATE",
    "TEXTAREA",
    "SELECT",
    "RADIO",
    "MULTISELECT",
    "CHECKBOX",
    "CHECKBOXES",
  ]).default("TEXT"),
  required: z.boolean().default(false),
  placeholder: str(),
  options: z.array(str()).default([]),
});

export const formEmbedDataSchema = withStyle(z.object({
  eyebrow: str("Form"),
  heading: str("Send us a message"),
  description: str("Complete the form below and we'll get back to you."),
  formId: str(),
  formSlug: str("contact"),
  formTitle: str(),
  formDescription: str(),
  submitLabel: str("Submit"),
  successMessage: str("Thanks! We received your submission."),
  emptyText: str("Select a form with fields to show it here."),
  closedText: str("This form is currently closed."),
  layout: z.enum(["card", "split", "minimal"]).default("card"),
  tone: z.enum(["light", "soft", "dark", "accent"]).default("light"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  align: z.enum(["left", "center"]).default("center"),
  showHeader: z.boolean().default(true),
  useFormCopy: z.boolean().default(true),
  isOpen: z.boolean().default(true),
  fields: z.array(embeddedFormFieldSchema).default([]),
}));

export const dividerDataSchema = withStyle(z.object({
  variant: z
    .enum(["line", "dots", "space", "double", "gradient", "label", "icon", "wave"])
    .default("line"),
  label: str(),
  icon: str(),
  width: z.enum(["narrow", "wide", "full", "bleed"]).default("wide"),
  thickness: z.enum(["hairline", "thin", "medium", "thick"]).default("thin"),
  spacing: z.enum(["xs", "sm", "md", "lg", "xl"]).default("md"),
  tone: z.enum(["muted", "accent", "dark", "light"]).default("muted"),
  lineStyle: z.enum(["solid", "dashed", "dotted"]).default("solid"),
  align: z.enum(["left", "center", "right"]).default("center"),
  color: str(),
}));

export const collectionItemSchema = z.object({
  title: str("Item title"),
  description: str("Short description for this item."),
  href: str("#"),
  badge: str(),
  meta: str(),
  detail: str(),
  imageUrl: str(),
});

export const collectionDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str("Featured items"),
  subheading: str("Highlight selected content from your workspace."),
  buttonLabel: str("View all"),
  buttonHref: str("#"),
  ctaLabel: str(),
  source: z.enum(["auto", "manual"]).default("auto"),
  limit: z.number().int().min(1).max(12).default(6),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  layout: z.enum(["grid", "featured", "compact", "carousel", "split"]).default("grid"),
  // Auto mode only: server reads these in lib/blocks/integrations.ts to
  // pick which records to show and in what order.
  sortBy: z.enum(["newest", "oldest", "name"]).default("newest"),
  categorySlug: str(""),
  tone: z.enum(["light", "soft", "dark", "accent"]).default("light"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  imageAspect: z.enum(["landscape", "square", "portrait"]).default("landscape"),
  cardStyle: z.enum(["border", "elevated", "plain", "inset"]).default("border"),
  imageFit: z.enum(["cover", "contain"]).default("cover"),
  buttonStyle: z.enum(["solid", "soft", "outline"]).default("outline"),
  gap: z.enum(["tight", "normal", "loose"]).default("normal"),
  align: z.enum(["left", "center"]).default("left"),
  highlightFirst: z.boolean().default(false),
  showImages: z.boolean().default(true),
  showBadge: z.boolean().default(true),
  showMeta: z.boolean().default(true),
  showDetail: z.boolean().default(true),
  showDescription: z.boolean().default(true),
  compact: z.boolean().default(false),
  emptyText: str("Items will appear here once they are available."),
  items: z.array(collectionItemSchema).default([
    {
      title: "Featured item",
      description: "Add your best product, course, post, or plan here.",
      href: "#",
      badge: "Featured",
      meta: "",
      detail: "",
      imageUrl: "",
    },
  ]),
}));

export const buttonItemSchema = z.object({
  label: str("Click me"),
  href: str("#"),
  icon: str(),
  badge: str(),
  description: str(),
  meta: str(),
  ariaLabel: str(),
  variant: z
    .enum(["solid", "soft", "outline", "ghost", "link", "gradient", "glass"])
    .default("solid"),
  color: z
    .enum(["accent", "neutral", "primary", "success", "warning", "danger", "custom"])
    .default("accent"),
  sizeOverride: z.enum(["default", "sm", "md", "lg", "xl"]).default("default"),
  iconPosition: z.enum(["left", "right"]).default("left"),
  customColor: str(),
  customTextColor: str(),
  openInNewTab: z.boolean().default(false),
  noFollow: z.boolean().default(false),
  highlighted: z.boolean().default(false),
});

export const buttonDataSchema = withStyle(z.object({
  eyebrow: str(),
  heading: str(),
  description: str(),
  layout: z
    .enum([
      "inline",
      "stacked",
      "grid",
      "linktree",
      "split",
      "cards",
      "social",
      "banner",
      "toolbar",
    ])
    .default("inline"),
  size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  shape: z.enum(["rounded", "pill", "square"]).default("rounded"),
  tone: z.enum(["plain", "soft", "light", "dark", "accent"]).default("plain"),
  align: z.enum(["left", "center", "right"]).default("center"),
  gap: z.enum(["tight", "normal", "loose"]).default("normal"),
  containerStyle: z.enum(["plain", "panel", "bordered", "glass"]).default("plain"),
  headerPlacement: z.enum(["top", "inline"]).default("top"),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  fullWidthButtons: z.boolean().default(false),
  equalWidth: z.boolean().default(false),
  mobileStack: z.boolean().default(true),
  showIcons: z.boolean().default(true),
  showDescriptions: z.boolean().default(false),
  showMeta: z.boolean().default(false),
  showArrows: z.boolean().default(false),
  showShadow: z.boolean().default(true),
  animation: z.enum(["none", "pulse", "shine", "lift"]).default("none"),
  footnote: str(),
  items: z
    .array(buttonItemSchema)
    .default([
      {
        label: "Get started",
        href: "#",
        icon: "arrow-right",
        badge: "",
        description: "",
        meta: "",
        ariaLabel: "",
        variant: "solid",
        color: "accent",
        sizeOverride: "default",
        iconPosition: "left",
        customColor: "",
        customTextColor: "",
        openInNewTab: false,
        noFollow: false,
        highlighted: true,
      },
      {
        label: "Learn more",
        href: "#",
        icon: "",
        badge: "",
        description: "",
        meta: "",
        ariaLabel: "",
        variant: "outline",
        color: "neutral",
        sizeOverride: "default",
        iconPosition: "left",
        customColor: "",
        customTextColor: "",
        openInNewTab: false,
        noFollow: false,
        highlighted: false,
      },
    ]),
}));

export const bioProfileSocialSchema = z.object({
  platform: z
    .enum([
      "website",
      "email",
      "instagram",
      "twitter",
      "x",
      "facebook",
      "youtube",
      "tiktok",
      "linkedin",
      "github",
      "whatsapp",
      "telegram",
      "discord",
      "spotify",
      "dribbble",
      "behance",
      "twitch",
      "custom",
    ])
    .default("instagram"),
  label: str(),
  href: str("#"),
  ariaLabel: str(),
  openInNewTab: z.boolean().default(true),
  noFollow: z.boolean().default(false),
});

export const bioProfileLinkSchema = z.object({
  label: str("Link title"),
  description: str(),
  meta: str(),
  href: str("#"),
  icon: str(),
  thumbnail: str(),
  badge: str(),
  ariaLabel: str(),
  highlighted: z.boolean().default(false),
  openInNewTab: z.boolean().default(true),
  noFollow: z.boolean().default(false),
});

export const bioProfileStatSchema = z.object({
  value: str("0"),
  label: str("Followers"),
});

export const bioProfileDataSchema = withStyle(z.object({
  eyebrow: str(),
  name: str("Your Name"),
  title: str("Creator & Founder"),
  tagline: str(),
  bio: str(
    "Sharing thoughts, products, and links — everything in one place."
  ),
  location: str(),
  pronouns: str(),
  badge: str("Available"),
  badgeTone: z
    .enum(["success", "warning", "info", "neutral", "accent"])
    .default("success"),
  avatarUrl: str(),
  avatarAlt: str(),
  coverUrl: str(),
  coverAlt: str(),
  verified: z.boolean().default(false),
  primaryLabel: str("Follow"),
  primaryHref: str("#"),
  secondaryLabel: str("Message"),
  secondaryHref: str("#"),
  showStats: z.boolean().default(true),
  showSocials: z.boolean().default(true),
  showLinks: z.boolean().default(true),
  showCover: z.boolean().default(false),
  showBadge: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showPronouns: z.boolean().default(true),
  showPrimaryActions: z.boolean().default(true),
  showLinkDescriptions: z.boolean().default(true),
  showLinkMeta: z.boolean().default(true),
  showLinkBadges: z.boolean().default(true),
  showLinkThumbnails: z.boolean().default(true),
  socials: z
    .array(bioProfileSocialSchema)
    .default([
      { platform: "instagram", label: "", href: "#" },
      { platform: "twitter", label: "", href: "#" },
      { platform: "linkedin", label: "", href: "#" },
    ]),
  links: z
    .array(bioProfileLinkSchema)
    .default([
      {
        label: "My latest product",
        description: "Tap to see what's new from the studio.",
        meta: "",
        href: "#",
        icon: "sparkles",
        thumbnail: "",
        badge: "New",
        ariaLabel: "",
        highlighted: true,
        openInNewTab: true,
        noFollow: false,
      },
      {
        label: "Subscribe to newsletter",
        description: "Get weekly insights in your inbox.",
        meta: "",
        href: "#",
        icon: "mail",
        thumbnail: "",
        badge: "",
        ariaLabel: "",
        highlighted: false,
        openInNewTab: true,
        noFollow: false,
      },
      {
        label: "Book a 1:1 session",
        description: "Available for mentoring and consulting.",
        meta: "",
        href: "#",
        icon: "calendar",
        thumbnail: "",
        badge: "",
        ariaLabel: "",
        highlighted: false,
        openInNewTab: true,
        noFollow: false,
      },
    ]),
  stats: z
    .array(bioProfileStatSchema)
    .default([
      { value: "12K", label: "Followers" },
      { value: "320", label: "Posts" },
      { value: "98", label: "Projects" },
    ]),
  layout: z
    .enum(["card", "centered", "linktree", "banner", "split", "minimal"])
    .default("card"),
  tone: z.enum(["light", "soft", "dark", "accent", "gradient"]).default("light"),
  width: z.enum(["narrow", "wide", "full"]).default("narrow"),
  buttonStyle: z.enum(["solid", "soft", "outline"]).default("solid"),
  avatarShape: z.enum(["circle", "rounded", "square"]).default("circle"),
  avatarSize: z.enum(["sm", "md", "lg", "xl"]).default("lg"),
  avatarRing: z.enum(["none", "light", "accent", "gradient"]).default("light"),
  coverHeight: z.enum(["sm", "md", "lg"]).default("md"),
  profileFrame: z.enum(["card", "flat", "glass", "bordered"]).default("card"),
  align: z.enum(["left", "center"]).default("center"),
  socialStyle: z.enum(["icons", "buttons", "chips"]).default("icons"),
  socialPlacement: z.enum(["underBio", "top", "bottom"]).default("underBio"),
  linkLayout: z.enum(["list", "cards", "compact", "featured"]).default("list"),
  linkStyle: z.enum(["solid", "soft", "outline", "glass"]).default("outline"),
  compact: z.boolean().default(false),
}));

export const affiliateCtaDataSchema = withStyle(z.object({
  eyebrow: str("Affiliate program"),
  heading: str("Join our affiliate program"),
  description: str(
    "Earn commission by sharing this business with your audience."
  ),
  commission: str("20% commission"),
  payoutLabel: str("Monthly payouts"),
  cookieLabel: str("30-day attribution"),
  proofText: str("Built for creators, partners, and loyal customers."),
  imageUrl: str(),
  primaryLabel: str("Become an affiliate"),
  primaryHref: str("/affiliates"),
  secondaryLabel: str("Learn more"),
  secondaryHref: str("#"),
  layout: z.enum(["card", "split", "banner", "stacked"]).default("card"),
  tone: z.enum(["dark", "light", "soft", "accent"]).default("dark"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  buttonStyle: z.enum(["solid", "soft", "outline"]).default("solid"),
  showStats: z.boolean().default(true),
  showBenefits: z.boolean().default(true),
  showImage: z.boolean().default(false),
  compact: z.boolean().default(false),
  benefits: z.array(str()).default([
    "Share a dedicated referral link",
    "Earn commission from eligible purchases",
    "Track signups and payouts from your dashboard",
  ]),
}));

export const navItemSchema = z.object({
  label: str("Menu item"),
  href: str("#"),
  description: str(),
  badge: str(),
});

export const headerDataSchema = withStyle(z.object({
  /**
   * Blok ini menampilkan header situs yang dipakai bersama semua halaman.
   * Default false: blok lama tetap memakai isinya sendiri.
   */
  siteWide: z.boolean().default(false),
  logoText: str("Brand"),
  logoUrl: str(),
  tagline: str(),
  primaryLabel: str("Get started"),
  primaryHref: str("#"),
  secondaryLabel: str(),
  secondaryHref: str("#"),
  layout: z.enum(["left", "center", "split"]).default("left"),
  tone: z.enum(["light", "soft", "dark", "transparent"]).default("light"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  buttonStyle: z.enum(["solid", "soft", "outline"]).default("solid"),
  sticky: z.boolean().default(false),
  mobileMenu: z.boolean().default(true),
  showLogo: z.boolean().default(true),
  showNav: z.boolean().default(true),
  showCta: z.boolean().default(true),
  navItems: z.array(navItemSchema).default([
    { label: "Features", href: "#features", description: "", badge: "" },
    { label: "Pricing", href: "#pricing", description: "", badge: "" },
    { label: "Contact", href: "#contact", description: "", badge: "" },
  ]),
}));

export const menuDataSchema = withStyle(z.object({
  eyebrow: str("Menu"),
  heading: str("Explore"),
  description: str("Guide visitors to the most important pages."),
  layout: z.enum(["pills", "list", "grid", "compact"]).default("pills"),
  tone: z.enum(["light", "soft", "dark", "accent"]).default("light"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  align: z.enum(["left", "center"]).default("center"),
  showHeader: z.boolean().default(true),
  showDescriptions: z.boolean().default(false),
  items: z.array(navItemSchema).default([
    { label: "Home", href: "#", description: "Back to the top", badge: "" },
    { label: "Products", href: "products", description: "Browse the catalog", badge: "" },
    { label: "Courses", href: "courses", description: "Start learning", badge: "" },
    { label: "Blog", href: "blog", description: "Read latest updates", badge: "" },
  ]),
}));

export const footerDataSchema = withStyle(z.object({
  /** Seperti header: menampilkan footer situs yang dipakai bersama. */
  siteWide: z.boolean().default(false),
  brand: str("Brand"),
  description: str("A short closing statement about your business."),
  copyright: str("All rights reserved."),
  ctaHeading: str(),
  ctaDescription: str(),
  ctaLabel: str(),
  ctaHref: str("#"),
  layout: z
    .enum(["simple", "columns", "cta", "centered", "minimal"])
    .default("columns"),
  tone: z.enum(["light", "soft", "dark", "accent"]).default("light"),
  width: z.enum(["narrow", "wide", "full"]).default("wide"),
  showBrand: z.boolean().default(true),
  showCopyright: z.boolean().default(true),
  showSocial: z.boolean().default(true),
  navItems: z.array(navItemSchema).default([
    { label: "Home", href: "#", description: "", badge: "" },
    { label: "Products", href: "products", description: "", badge: "" },
    { label: "Courses", href: "courses", description: "", badge: "" },
  ]),
  socialItems: z.array(navItemSchema).default([
    { label: "Instagram", href: "#", description: "", badge: "" },
    { label: "YouTube", href: "#", description: "", badge: "" },
    { label: "WhatsApp", href: "#", description: "", badge: "" },
  ]),
}));

// ============================================================
// Block union
// ============================================================

export const blockTypes = [
  "HEADER",
  "MENU",
  "HERO",
  "TEXT",
  "CUSTOM_HTML",
  "COLUMNS",
  "IMAGE",
  "CTA",
  "FEATURE_GRID",
  "STATS",
  "STEPS",
  "PRICING",
  "TESTIMONIAL",
  "LOGOS",
  "GALLERY",
  "IMAGE_SLIDER",
  "VIDEO",
  "FAQ",
  "NEWSLETTER",
  "BANNER",
  "CONTACT_FORM",
  "FORM_EMBED",
  "DIVIDER",
  "PRODUCT_SHOWCASE",
  "COURSE_SHOWCASE",
  "BLOG_SHOWCASE",
  "MEMBERSHIP_SHOWCASE",
  "AFFILIATE_CTA",
  "BUTTON",
  "BIO_PROFILE",
  "COUNTDOWN",
  "COMPARISON_TABLE",
  "MARQUEE",
  "FOOTER",
  "WHATSAPP_FLOAT",
  "MAP",
  "TABS",
] as const;

export type BlockType = (typeof blockTypes)[number];

export const blockDataSchemas = {
  HEADER: headerDataSchema,
  MENU: menuDataSchema,
  HERO: heroDataSchema,
  TEXT: textDataSchema,
  CUSTOM_HTML: customHtmlDataSchema,
  COLUMNS: columnsDataSchema,
  IMAGE: imageDataSchema,
  CTA: ctaDataSchema,
  FEATURE_GRID: featureGridDataSchema,
  STATS: statsDataSchema,
  STEPS: stepsDataSchema,
  PRICING: pricingDataSchema,
  TESTIMONIAL: testimonialDataSchema,
  LOGOS: logosDataSchema,
  GALLERY: galleryDataSchema,
  IMAGE_SLIDER: imageSliderDataSchema,
  VIDEO: videoDataSchema,
  FAQ: faqDataSchema,
  NEWSLETTER: newsletterDataSchema,
  BANNER: bannerDataSchema,
  CONTACT_FORM: contactFormDataSchema,
  FORM_EMBED: formEmbedDataSchema,
  DIVIDER: dividerDataSchema,
  PRODUCT_SHOWCASE: collectionDataSchema,
  COURSE_SHOWCASE: collectionDataSchema,
  BLOG_SHOWCASE: collectionDataSchema,
  MEMBERSHIP_SHOWCASE: collectionDataSchema,
  AFFILIATE_CTA: affiliateCtaDataSchema,
  BUTTON: buttonDataSchema,
  BIO_PROFILE: bioProfileDataSchema,
  COUNTDOWN: countdownDataSchema,
  COMPARISON_TABLE: comparisonTableDataSchema,
  MARQUEE: marqueeDataSchema,
  FOOTER: footerDataSchema,
  WHATSAPP_FLOAT: whatsappFloatDataSchema,
  MAP: mapDataSchema,
  TABS: tabsDataSchema,
} as const;

export type NavItem = z.infer<typeof navItemSchema>;
export type HeaderData = z.infer<typeof headerDataSchema>;
export type MenuData = z.infer<typeof menuDataSchema>;
export type FooterData = z.infer<typeof footerDataSchema>;
export type HeroData = z.infer<typeof heroDataSchema>;
export type BlockStyle = z.infer<typeof blockStyleSchema>;
export type { BlockAnimation } from "./animation";
export type TextData = z.infer<typeof textDataSchema>;
export type CustomHtmlData = z.infer<typeof customHtmlDataSchema>;
export type ColumnsData = z.infer<typeof columnsDataSchema>;
export type ImageData = z.infer<typeof imageDataSchema>;
export type CtaData = z.infer<typeof ctaDataSchema>;
export type FeatureGridData = z.infer<typeof featureGridDataSchema>;
export type StatsData = z.infer<typeof statsDataSchema>;
export type StepsData = z.infer<typeof stepsDataSchema>;
export type PricingData = z.infer<typeof pricingDataSchema>;
export type TestimonialData = z.infer<typeof testimonialDataSchema>;
export type LogosData = z.infer<typeof logosDataSchema>;
export type GalleryData = z.infer<typeof galleryDataSchema>;
export type ImageSliderData = z.infer<typeof imageSliderDataSchema>;
export type VideoData = z.infer<typeof videoDataSchema>;
export type FaqData = z.infer<typeof faqDataSchema>;
export type NewsletterData = z.infer<typeof newsletterDataSchema>;
export type BannerData = z.infer<typeof bannerDataSchema>;
export type ContactFormData = z.infer<typeof contactFormDataSchema>;
export type FormEmbedData = z.infer<typeof formEmbedDataSchema>;
export type DividerData = z.infer<typeof dividerDataSchema>;
export type CollectionData = z.infer<typeof collectionDataSchema>;
export type AffiliateCtaData = z.infer<typeof affiliateCtaDataSchema>;
export type ButtonData = z.infer<typeof buttonDataSchema>;
export type ButtonItem = z.infer<typeof buttonItemSchema>;
export type BioProfileData = z.infer<typeof bioProfileDataSchema>;
export type BioProfileSocial = z.infer<typeof bioProfileSocialSchema>;
export type BioProfileLink = z.infer<typeof bioProfileLinkSchema>;
export type BioProfileStat = z.infer<typeof bioProfileStatSchema>;
export type CountdownData = z.infer<typeof countdownDataSchema>;
export type ComparisonTableData = z.infer<typeof comparisonTableDataSchema>;
export type ComparisonColumn = z.infer<typeof comparisonColumnSchema>;
export type ComparisonRow = z.infer<typeof comparisonRowSchema>;
export type MarqueeData = z.infer<typeof marqueeDataSchema>;
export type MarqueeItem = z.infer<typeof marqueeItemSchema>;
export type WhatsappFloatData = z.infer<typeof whatsappFloatDataSchema>;
export type MapData = z.infer<typeof mapDataSchema>;
export type TabItem = z.infer<typeof tabItemSchema>;
export type TabsData = z.infer<typeof tabsDataSchema>;

export type BlockDataMap = {
  HEADER: HeaderData;
  MENU: MenuData;
  HERO: HeroData;
  TEXT: TextData;
  CUSTOM_HTML: CustomHtmlData;
  COLUMNS: ColumnsData;
  IMAGE: ImageData;
  CTA: CtaData;
  FEATURE_GRID: FeatureGridData;
  STATS: StatsData;
  STEPS: StepsData;
  PRICING: PricingData;
  TESTIMONIAL: TestimonialData;
  LOGOS: LogosData;
  GALLERY: GalleryData;
  IMAGE_SLIDER: ImageSliderData;
  VIDEO: VideoData;
  FAQ: FaqData;
  NEWSLETTER: NewsletterData;
  BANNER: BannerData;
  CONTACT_FORM: ContactFormData;
  FORM_EMBED: FormEmbedData;
  DIVIDER: DividerData;
  PRODUCT_SHOWCASE: CollectionData;
  COURSE_SHOWCASE: CollectionData;
  BLOG_SHOWCASE: CollectionData;
  MEMBERSHIP_SHOWCASE: CollectionData;
  AFFILIATE_CTA: AffiliateCtaData;
  BUTTON: ButtonData;
  BIO_PROFILE: BioProfileData;
  COUNTDOWN: CountdownData;
  COMPARISON_TABLE: ComparisonTableData;
  MARQUEE: MarqueeData;
  FOOTER: FooterData;
  WHATSAPP_FLOAT: WhatsappFloatData;
  MAP: MapData;
  TABS: TabsData;
};

// One block as it lives in the builder (id is client-side only).
export type Block = {
  [K in BlockType]: { id: string; type: K; data: BlockDataMap[K] };
}[BlockType];

// Discriminated union for the save payload (no id — order is by index).
export const blockInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("HEADER"), data: headerDataSchema }),
  z.object({ type: z.literal("MENU"), data: menuDataSchema }),
  z.object({ type: z.literal("HERO"), data: heroDataSchema }),
  z.object({ type: z.literal("TEXT"), data: textDataSchema }),
  z.object({ type: z.literal("CUSTOM_HTML"), data: customHtmlDataSchema }),
  z.object({ type: z.literal("COLUMNS"), data: columnsDataSchema }),
  z.object({ type: z.literal("IMAGE"), data: imageDataSchema }),
  z.object({ type: z.literal("CTA"), data: ctaDataSchema }),
  z.object({ type: z.literal("FEATURE_GRID"), data: featureGridDataSchema }),
  z.object({ type: z.literal("STATS"), data: statsDataSchema }),
  z.object({ type: z.literal("STEPS"), data: stepsDataSchema }),
  z.object({ type: z.literal("PRICING"), data: pricingDataSchema }),
  z.object({ type: z.literal("TESTIMONIAL"), data: testimonialDataSchema }),
  z.object({ type: z.literal("LOGOS"), data: logosDataSchema }),
  z.object({ type: z.literal("GALLERY"), data: galleryDataSchema }),
  z.object({ type: z.literal("IMAGE_SLIDER"), data: imageSliderDataSchema }),
  z.object({ type: z.literal("VIDEO"), data: videoDataSchema }),
  z.object({ type: z.literal("FAQ"), data: faqDataSchema }),
  z.object({ type: z.literal("NEWSLETTER"), data: newsletterDataSchema }),
  z.object({ type: z.literal("BANNER"), data: bannerDataSchema }),
  z.object({ type: z.literal("CONTACT_FORM"), data: contactFormDataSchema }),
  z.object({ type: z.literal("FORM_EMBED"), data: formEmbedDataSchema }),
  z.object({ type: z.literal("DIVIDER"), data: dividerDataSchema }),
  z.object({ type: z.literal("PRODUCT_SHOWCASE"), data: collectionDataSchema }),
  z.object({ type: z.literal("COURSE_SHOWCASE"), data: collectionDataSchema }),
  z.object({ type: z.literal("BLOG_SHOWCASE"), data: collectionDataSchema }),
  z.object({ type: z.literal("MEMBERSHIP_SHOWCASE"), data: collectionDataSchema }),
  z.object({ type: z.literal("AFFILIATE_CTA"), data: affiliateCtaDataSchema }),
  z.object({ type: z.literal("BUTTON"), data: buttonDataSchema }),
  z.object({ type: z.literal("BIO_PROFILE"), data: bioProfileDataSchema }),
  z.object({ type: z.literal("COUNTDOWN"), data: countdownDataSchema }),
  z.object({ type: z.literal("COMPARISON_TABLE"), data: comparisonTableDataSchema }),
  z.object({ type: z.literal("MARQUEE"), data: marqueeDataSchema }),
  z.object({ type: z.literal("FOOTER"), data: footerDataSchema }),
  z.object({ type: z.literal("WHATSAPP_FLOAT"), data: whatsappFloatDataSchema }),
  z.object({ type: z.literal("MAP"), data: mapDataSchema }),
  z.object({ type: z.literal("TABS"), data: tabsDataSchema }),
]);

export const pageBlocksSchema = z.array(blockInputSchema).max(60);

export type BlockInput = z.infer<typeof blockInputSchema>;

/**
 * Parses an unknown stored value into typed block data for a given type.
 * Falls back to schema defaults for missing/invalid fields — only those.
 *
 * Dulu satu field yang tidak valid membuat seluruh blok kembali ke default.
 * Itu bukan sekadar masalah tampilan: builder memuat blok lewat fungsi ini,
 * jadi pemilik situs melihat isi bawaan, lalu autosave menulis isi bawaan
 * itu kembali ke database — dan isi aslinya hilang permanen. Sekarang hanya
 * bagian yang tidak valid yang dikembalikan ke default.
 */
export function parseBlockData<T extends BlockType>(
  type: T,
  raw: unknown
): BlockDataMap[T] {
  return parseBlockDataWithReport(type, raw).data;
}

export type BlockParseReport<T extends BlockType> = {
  data: BlockDataMap[T];
  /** Path field yang dibuang atau dipotong karena tidak valid. */
  repaired: string[];
};

const REMOVED = Symbol("removed");

function removeAtPath(root: unknown, path: (string | number)[]): boolean {
  if (path.length === 0) return false;
  let parent: unknown = root;
  for (const segment of path.slice(0, -1)) {
    if (!parent || typeof parent !== "object") return false;
    parent = (parent as Record<string | number, unknown>)[segment];
  }
  if (!parent || typeof parent !== "object") return false;
  const last = path[path.length - 1];
  if (Array.isArray(parent) && typeof last === "number") {
    // Ditandai dulu, dipadatkan setelah satu putaran, supaya indeks isu lain
    // di putaran yang sama tidak bergeser.
    parent[last] = REMOVED;
  } else {
    delete (parent as Record<string, unknown>)[String(last)];
  }
  return true;
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== REMOVED).map(compact);
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      (value as Record<string, unknown>)[key] = compact(entry);
    }
  }
  return value;
}

function getAtPath(root: unknown, path: (string | number)[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

/**
 * Seperti `parseBlockData`, sekaligus melaporkan apa yang harus diperbaiki —
 * supaya pemanggil di server bisa mencatatnya alih-alih kehilangan data tanpa
 * jejak.
 *
 * Tiap putaran membuang hanya field yang tidak valid lalu mem-parse ulang;
 * field yang punya default akan terisi default-nya. Field wajib tanpa default
 * yang masih gagal membuat objek induknya ikut dibuang pada putaran berikut.
 * Daftar atau teks yang terlalu panjang dipotong, bukan dibuang.
 */
export function parseBlockDataWithReport<T extends BlockType>(
  type: T,
  raw: unknown
): BlockParseReport<T> {
  const schema = blockDataSchemas[type];
  const first = schema.safeParse(raw ?? {});
  if (first.success) return { data: first.data as BlockDataMap[T], repaired: [] };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { data: schema.parse({}) as BlockDataMap[T], repaired: ["*"] };
  }

  let working: unknown = JSON.parse(JSON.stringify(raw));
  const repaired: string[] = [];
  const touched = new Set<string>();

  for (let round = 0; round < 10; round++) {
    const result = schema.safeParse(working);
    if (result.success) {
      return { data: result.data as BlockDataMap[T], repaired };
    }

    for (const issue of result.error.issues) {
      let path = [...issue.path];
      const key = path.join(".");

      const current = getAtPath(working, path);
      if (issue.code === "too_big" && Array.isArray(current)) {
        current.length = Number(issue.maximum);
        repaired.push(`${key} (dipotong)`);
        continue;
      }
      if (issue.code === "too_big" && typeof current === "string") {
        const parent = getAtPath(working, path.slice(0, -1));
        if (parent && typeof parent === "object") {
          (parent as Record<string | number, unknown>)[path[path.length - 1]] =
            current.slice(0, Number(issue.maximum));
          repaired.push(`${key} (dipotong)`);
          continue;
        }
      }

      // Field yang sudah dibuang tapi masih gagal berarti wajib tanpa
      // default: naik satu tingkat.
      while (touched.has(path.join(".")) && path.length > 0) {
        path = path.slice(0, -1);
      }
      if (!removeAtPath(working, path)) {
        return { data: schema.parse({}) as BlockDataMap[T], repaired: ["*"] };
      }
      touched.add(path.join("."));
      repaired.push(path.join(".") || "*");
    }
    working = compact(working);
  }

  return { data: schema.parse({}) as BlockDataMap[T], repaired: ["*"] };
}
