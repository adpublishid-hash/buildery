import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import { ProductPreview } from "@/components/landing/product-preview";
import { LANDING_CONTAINER, SectionHeading, SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { PricingCards } from "@/components/billing/pricing-cards";
import { FadeIn, RevealOnScroll, Stagger, StaggerItem } from "@/components/ui/motion-primitives";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const valueBand = [
  { figure: "6 → 1", label: "tool digabung jadi satu" },
  { figure: "1", label: "login untuk semuanya" },
  { figure: "100%", label: "bisa kamu host sendiri" },
  { figure: "Rp 0", label: "buat mulai pertama kali" },
];

const steps = [
  {
    title: "Buat workspace-mu",
    body: "Pilih nama, atur warna brand, undang tim. Beres sebelum kopimu dingin.",
  },
  {
    title: "Bangun & isi",
    body: "Halaman, produk, kursus, artikel, form — tambahkan apa yang kamu jual dan apa yang kamu omongin, semua di satu editor.",
  },
  {
    title: "Publish & lihat tumbuh",
    body: "Online di domainmu, terima pembayaran, dan pantau angka asli pas pelanggan mulai berdatangan.",
  },
];

const faqs = [
  {
    q: "Apakah My Landing benar-benar gratis?",
    a: "Ya. Plan Free bisa dipakai tanpa kartu kredit, dengan batas penggunaan yang tercantum di halaman Harga. Upgrade diperlukan saat kamu butuh custom domain, form, kursus, kapasitas lebih besar, atau fitur growth lanjutan.",
  },
  {
    q: "Saya harus bisa coding?",
    a: "Tidak. Halaman disusun lewat blok dan pengaturan visual. Kalau dibutuhkan, pengguna teknis tetap bisa menambahkan blok HTML khusus tanpa menjadikannya syarat untuk mulai.",
  },
  {
    q: "Bisa pakai domain sendiri?",
    a: "Bisa mulai plan Starter. Setiap workspace tetap mendapat subdomain landing.my.id; untuk custom domain, arahkan DNS dan selesaikan verifikasi kepemilikan sebelum domain diaktifkan dengan HTTPS.",
  },
  {
    q: "Metode pembayaran apa yang bisa dipakai pelanggan?",
    a: "Pemilik toko bisa mengaktifkan Midtrans, transfer bank atau QRIS manual, dan COD. Metode yang tampil mengikuti pengaturan tiap toko; pembayaran Midtrans diperbarui otomatis, sedangkan pembayaran manual diverifikasi oleh tim toko.",
  },
  {
    q: "Apakah saya harus menyiapkan hosting sendiri?",
    a: "Tidak. Pengguna My Landing mendapat hosting publik dan subdomain untuk setiap workspace. Self-host di VPS tersedia untuk operator yang memasang Buildery secara mandiri, bukan kewajiban untuk membuat situs.",
  },
];

const CONTAINER = LANDING_CONTAINER;

export default async function HomePage() {
  const session = await auth();
  const isAuthed = Boolean(session?.user);
  const primaryHref = isAuthed ? "/dashboard" : "/register";
  const [plans, currentSub] = await Promise.all([
    prisma.saaSPlan.findMany({
      where: { isPublic: true, tier: { not: "BUSINESS" } },
      orderBy: { sortOrder: "asc" },
    }),
    session?.user
      ? prisma.saaSSubscription.findUnique({
          where: { userId: session.user.id },
          include: { plan: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="min-h-screen bg-kv-bg text-kv-fg">
      <SiteHeader isAuthed={isAuthed} loginCallbackUrl="/" container={LANDING_CONTAINER} />

      <main>
        {/* ---- hero ---- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[520px] bg-[url('/dashboard/card-pattern.svg')] bg-top bg-no-repeat opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"
          />
          <div className={`${CONTAINER} relative pb-[64px] pt-[56px] text-center sm:pb-[88px] sm:pt-[80px]`}>
            <FadeIn>
              <p className="inline-flex h-[28px] items-center gap-[8px] rounded-full border-[0.8px] border-kv-border bg-kv-card px-[12px] text-[12px] font-medium text-kv-secondary-fg shadow-kv-soft">
                <span className="kv-gradient h-[6px] w-[6px] rounded-full" />
                Situs · Toko · Kursus · Membership
              </p>
              <h1 className="mx-auto mt-[20px] max-w-[760px] text-[36px] font-semibold leading-[1.06] tracking-[-0.03em] text-kv-fg sm:text-[48px] lg:text-[56px]">
                Situs, toko, dan kursusmu — cukup satu login.
              </h1>
              <p className="mx-auto mt-[18px] max-w-[540px] text-[15px] leading-[1.6] text-kv-muted-fg">
                Workspace all-in-one untuk kreator, edukator, dan brand kecil. Bangun halaman, jual
                produk, buka kursus, dan baca analytics dari satu tempat.
              </p>

              <div className="mt-[28px] flex flex-col items-center justify-center gap-[8px] sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href={primaryHref}>
                    {isAuthed ? "Buka dashboard" : "Mulai gratis"}
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <a href="#fitur">Lihat fitur</a>
                </Button>
              </div>

              <ul className="mt-[20px] flex flex-wrap items-center justify-center gap-x-[18px] gap-y-[6px] text-[12px] text-kv-muted-fg">
                {["Gratis selamanya", "Tanpa kartu kredit", "Bisa self-host"].map((item) => (
                  <li key={item} className="flex items-center gap-[6px]">
                    <Check className="h-[13px] w-[13px] text-kv-success" strokeWidth={2.2} />
                    {item}
                  </li>
                ))}
              </ul>
            </FadeIn>

            <FadeIn delay={0.15} className="mt-[40px] sm:mt-[48px]">
              <ProductPreview />
            </FadeIn>
          </div>
        </section>

        {/* ---- value band ---- */}
        <section className={CONTAINER}>
          <RevealOnScroll>
            <div className="kv-frame grid grid-cols-2 gap-[4px] p-[4px] lg:grid-cols-4">
              {valueBand.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[10px] border-[0.8px] border-kv-border bg-kv-card px-[16px] py-[18px] text-center"
                >
                  <p className="kv-tabular text-[24px] font-semibold leading-none tracking-[-0.02em] text-kv-fg">
                    {item.figure}
                  </p>
                  <p className="mt-[8px] text-[12px] text-kv-muted-fg">{item.label}</p>
                </div>
              ))}
            </div>
          </RevealOnScroll>
        </section>

        <FeatureShowcase />

        {/* ---- how it works ---- */}
        <section id="cara-kerja" className="scroll-mt-[72px] border-y-[0.8px] border-kv-border bg-kv-card py-[64px] sm:py-[88px]">
          <div className={CONTAINER}>
            <RevealOnScroll>
              <SectionHeading eyebrow="Cara kerja" title="Dari nol sampai online dalam 3 langkah." />
            </RevealOnScroll>
            <Stagger className="mt-[36px] grid gap-[12px] md:grid-cols-3">
              {steps.map((step, index) => (
                <StaggerItem key={step.title} className="h-full">
                  <div className="flex h-full flex-col gap-[10px] rounded-[12px] border-[0.8px] border-kv-border bg-kv-bg p-[16px]">
                    <span className="kv-gradient flex h-[24px] w-[24px] items-center justify-center rounded-[7px] text-[12px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <h3 className="text-[15px] font-semibold text-kv-fg">{step.title}</h3>
                    <p className="text-[13px] leading-[1.6] text-kv-muted-fg">{step.body}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ---- pricing ---- */}
        <section id="harga" className="scroll-mt-[72px] py-[64px] sm:py-[88px]">
          <div className={CONTAINER}>
            <RevealOnScroll>
              <SectionHeading
                eyebrow="Harga"
                title="Mulai gratis, upgrade saat siap tumbuh."
                description="Semua paket sudah termasuk website builder, blog, form, checkout, dan hosting publik."
              />
            </RevealOnScroll>

            <div className="mt-[36px]">
              {plans.length > 0 ? (
                <PricingCards
                  plans={plans}
                  currentTier={currentSub?.plan.tier ?? null}
                  isAuthenticated={isAuthed}
                  loginCallbackUrl="/#harga"
                />
              ) : (
                <div className="rounded-[12px] border-[0.8px] border-dashed border-kv-border bg-kv-card p-[32px] text-center">
                  <p className="text-[14px] font-medium text-kv-fg">Paket harga sedang disiapkan</p>
                  <p className="mx-auto mt-[6px] max-w-[420px] text-[13px] text-kv-muted-fg">
                    Jalankan seed atau atur SaaS plan dari database agar paket publik muncul di sini.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section id="faq" className="scroll-mt-[72px] pb-[64px] sm:pb-[88px]">
          <div className="mx-auto w-full max-w-[860px] px-[16px] sm:px-[24px]">
            <RevealOnScroll>
              <SectionHeading eyebrow="FAQ" title="Pertanyaan yang sering muncul." />
              <div className="mt-[32px] overflow-hidden rounded-[12px] border-[0.8px] border-kv-border bg-kv-card">
                {faqs.map((faq) => (
                  <details key={faq.q} className="group border-b border-black/[0.06] last:border-b-0">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-[16px] px-[16px] py-[14px] text-[14px] font-medium text-kv-fg transition-colors hover:bg-kv-hover [&::-webkit-details-marker]:hidden">
                      {faq.q}
                      <ChevronDown className="h-[16px] w-[16px] shrink-0 text-kv-subtle transition-transform duration-300 ease-out-expo group-open:rotate-180" />
                    </summary>
                    <p className="px-[16px] pb-[14px] text-[13px] leading-[1.6] text-kv-muted-fg">{faq.a}</p>
                  </details>
                ))}
              </div>
            </RevealOnScroll>
          </div>
        </section>

        {/* ---- final CTA ---- */}
        <section className={`${CONTAINER} pb-[64px] sm:pb-[88px]`}>
          <RevealOnScroll>
            <div className="kv-gradient relative overflow-hidden rounded-[16px] px-[24px] py-[40px] text-center text-white sm:px-[48px] sm:py-[56px]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[url('/dashboard/card-pattern.svg')] bg-center opacity-[0.25] invert"
              />
              <div className="relative">
                <h2 className="mx-auto max-w-[560px] text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[32px]">
                  Siap berhenti ngurusin tool yang kececer?
                </h2>
                <p className="mx-auto mt-[12px] max-w-[460px] text-[14px] leading-[1.6] text-white/70">
                  Buat akun kurang dari semenit. Bangun halaman pertamamu gratis — tanpa kartu kredit.
                </p>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="mt-[24px] border-white bg-white text-kv-fg hover:bg-white/90 hover:text-kv-fg"
                >
                  <Link href={primaryHref}>
                    {isAuthed ? "Buka dashboard" : "Buat akun gratis"}
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          </RevealOnScroll>
        </section>
      </main>

      <SiteFooter container={LANDING_CONTAINER} />
    </div>
  );
}
