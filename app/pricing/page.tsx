import Link from "next/link";
import type { Metadata } from "next";
import type { SaaSPlan } from "@prisma/client";
import { ArrowRight, Check, ChevronDown, X } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PricingCards } from "@/components/billing/pricing-cards";
import { MARKETING_CONTAINER, SectionHeading, SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Harga · My Landing" },
  description:
    "Harga sederhana dan transparan. Mulai gratis, upgrade saat bisnismu tumbuh.",
};

const trustNotes = [
  "Harga dalam Rupiah, cocok untuk market Indonesia.",
  "Mulai gratis tanpa kartu kredit.",
  "Plan berbayar aktif setelah pembayaran terverifikasi.",
];

const pricingFaqs = [
  {
    q: "Apakah paket Gratis benar-benar gratis?",
    a: "Ya. Paket Free tidak memerlukan kartu kredit. Kamu bisa membuat workspace, halaman, produk, blog, dan toko kecil sesuai batas pada tabel perbandingan; form, kursus, dan custom domain tersedia mulai Starter.",
  },
  {
    q: "Kapan saya perlu upgrade ke Pro?",
    a: "Upgrade ke Pro saat kamu membutuhkan membership, program afiliasi, analytics lanjutan, atau kapasitas di atas batas Starter. Jika hanya butuh form, kursus, atau custom domain, Starter sudah mendukungnya.",
  },
  {
    q: "Apakah fitur toko dan checkout ada di semua plan?",
    a: "Ya. Website builder, blog, toko, checkout, dan hosting publik tersedia di semua plan. Batas order bulanan dan lama penyimpanan riwayat mengikuti plan; form, kursus, dan custom domain tersedia mulai Starter.",
  },
  {
    q: "Bagaimana cara membayar plan berbayar?",
    a: "Pilih plan untuk membuat invoice QRIS, transfer sesuai nominal, lalu unggah bukti pembayaran. Plan aktif setelah pembayaran diverifikasi oleh admin; metode ini terpisah dari metode pembayaran pelanggan di tokomu.",
  },
  {
    q: "Bisa ganti atau membatalkan plan nanti?",
    a: "Bisa. Upgrade plan berbayar memperhitungkan sisa nilai masa aktif jika berlaku. Pembatalan atau kembali ke Free dijadwalkan pada akhir periode agar akses yang sudah dibayar tidak hilang lebih awal.",
  },
  {
    q: "Apakah custom domain tersedia di semua plan?",
    a: "Tidak. Paket Free memakai subdomain landing.my.id. Custom domain tersedia mulai Starter dan baru aktif setelah DNS mengarah ke My Landing serta kepemilikan domain berhasil diverifikasi.",
  },
];

const comparisonRows: {
  label: string;
  hint: string;
  value: (plan: SaaSPlan) => string | boolean;
}[] = [
  {
    label: "Workspace",
    hint: "Jumlah brand atau project yang bisa dikelola.",
    value: (plan) => formatLimit(plan.workspaceLimit, "workspace"),
  },
  {
    label: "Halaman",
    hint: "Landing page, halaman promo, dan halaman custom.",
    value: (plan) => formatLimit(plan.pageLimit, "halaman"),
  },
  {
    label: "Produk",
    hint: "Produk fisik atau digital di toko.",
    value: (plan) => formatLimit(plan.productLimit, "produk"),
  },
  {
    label: "Kursus",
    hint: "Kursus yang bisa dipublish dan dijual.",
    value: (plan) => plan.courseLimit === 0 ? false : formatLimit(plan.courseLimit, "kursus"),
  },
  {
    label: "Form",
    hint: "Form lead dan pengumpulan data pelanggan.",
    value: (plan) => plan.formLimit === 0 ? false : formatLimit(plan.formLimit, "form"),
  },
  {
    label: "Order per bulan",
    hint: "Jumlah checkout yang dapat menghasilkan order setiap bulan.",
    value: (plan) => formatLimit(plan.monthlyOrderLimit, "order"),
  },
  {
    label: "Penyimpanan data order",
    hint: "Order yang melewati periode ini dihapus otomatis.",
    value: (plan) => plan.orderRetentionMonths == null ? "Tanpa batas" : `${plan.orderRetentionMonths} bulan`,
  },
  {
    label: "Program afiliasi",
    hint: "Referral link dan tracking komisi partner.",
    value: (plan) => plan.hasAffiliate,
  },
  {
    label: "Tier membership",
    hint: "Buat konten premium dan akses member.",
    value: (plan) => plan.hasMembership,
  },
  {
    label: "Analytics lanjutan",
    hint: "Insight performa untuk halaman, funnel, dan revenue.",
    value: (plan) => plan.hasAdvancedAnalytics,
  },
];

export default async function PricingPage() {
  const session = await auth();

  const plans = await prisma.saaSPlan.findMany({
    where: { isPublic: true, tier: { not: "BUSINESS" } },
    orderBy: { sortOrder: "asc" },
  });

  const currentSub = session?.user
    ? await prisma.saaSSubscription.findUnique({
        where: { userId: session.user.id },
        include: { plan: true },
      })
    : null;

  const isAuthed = Boolean(session?.user);

  return (
    <div className="min-h-screen bg-kv-bg text-kv-fg">
      <SiteHeader isAuthed={isAuthed} loginCallbackUrl="/pricing" />

      <main>
        <section className={`${MARKETING_CONTAINER} pb-[48px] pt-[56px] sm:pt-[72px]`}>
          <SectionHeading
            as="h1"
            eyebrow="Harga"
            title="Pilih plan sesuai tahap bisnismu."
            description="Mulai gratis untuk validasi. Upgrade saat butuh lebih banyak workspace, produk, kursus, membership, afiliasi, dan analytics."
          />
          <ul className="mt-[18px] flex flex-wrap items-center justify-center gap-x-[18px] gap-y-[6px] text-[12px] text-kv-muted-fg">
            {trustNotes.map((item) => (
              <li key={item} className="flex items-center gap-[6px]">
                <Check className="h-[13px] w-[13px] text-kv-success" strokeWidth={2.2} />
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-[36px]">
            {plans.length > 0 ? (
              <PricingCards
                plans={plans}
                currentTier={currentSub?.plan.tier ?? null}
                isAuthenticated={isAuthed}
              />
            ) : (
              <div className="rounded-[12px] border-[0.8px] border-dashed border-kv-border bg-kv-card p-[32px] text-center">
                <p className="text-[14px] font-medium text-kv-fg">Paket harga sedang disiapkan</p>
                <p className="mx-auto mt-[6px] max-w-[420px] text-[13px] text-kv-muted-fg">
                  Paket publik muncul setelah seed SaaS plan atau setup admin dijalankan.
                </p>
              </div>
            )}
          </div>
        </section>

        {plans.length > 0 ? (
          <section className="border-y-[0.8px] border-kv-border bg-kv-card py-[56px] sm:py-[72px]">
            <div className={MARKETING_CONTAINER}>
              <SectionHeading
                eyebrow="Bandingkan plan"
                title="Batas dan fitur yang terbuka."
                description="Semua plan punya fondasi yang sama. Perbedaannya ada di kapasitas dan fitur growth."
              />
              <div className="mt-[32px] overflow-x-auto rounded-[12px] bg-kv-card p-[4px] shadow-[inset_0_0_0_0.8px_rgba(0,0,0,0.1)] [scrollbar-width:thin]">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-[13px]">
                  <thead>
                    <tr>
                      <th className="h-[34px] w-[34%] rounded-l-[8px] border-y-[0.8px] border-l-[0.8px] border-black/[0.04] bg-kv-secondary px-[14px] font-normal text-kv-secondary-fg">
                        Fitur
                      </th>
                      {plans.map((plan, index) => (
                        <th
                          key={plan.id}
                          className={`h-[34px] border-y-[0.8px] border-black/[0.04] bg-kv-secondary px-[14px] font-medium text-kv-fg ${
                            index === plans.length - 1 ? "rounded-r-[8px] border-r-[0.8px]" : ""
                          }`}
                        >
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.label} className="transition-colors hover:bg-kv-hover">
                        <td className="border-b border-black/[0.06] px-[14px] py-[10px]">
                          <p className="font-medium text-kv-fg">{row.label}</p>
                          <p className="mt-[3px] text-[12px] leading-[1.45] text-kv-subtle">{row.hint}</p>
                        </td>
                        {plans.map((plan) => {
                          const value = row.value(plan);
                          return (
                            <td key={plan.id} className="border-b border-black/[0.06] px-[14px] py-[10px] text-kv-cell">
                              {typeof value === "boolean" ? (
                                value ? (
                                  <Check className="h-[15px] w-[15px] text-kv-success" strokeWidth={2} />
                                ) : (
                                  <X className="h-[15px] w-[15px] text-kv-subtle" strokeWidth={2} />
                                )
                              ) : (
                                <span className="kv-tabular">{value}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        <section className="py-[56px] sm:py-[72px]">
          <div className="mx-auto w-full max-w-[860px] px-[16px] sm:px-[24px]">
            <SectionHeading eyebrow="FAQ billing" title="Pertanyaan sebelum upgrade." />
            <div className="mt-[32px] overflow-hidden rounded-[12px] border-[0.8px] border-kv-border bg-kv-card">
              {pricingFaqs.map((faq) => (
                <details key={faq.q} className="group border-b border-black/[0.06] last:border-b-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-[16px] px-[16px] py-[14px] text-[14px] font-medium text-kv-fg transition-colors hover:bg-kv-hover [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <ChevronDown className="h-[16px] w-[16px] shrink-0 text-kv-subtle transition-transform duration-300 ease-out-expo group-open:rotate-180" />
                  </summary>
                  <p className="px-[16px] pb-[14px] text-[13px] leading-[1.6] text-kv-muted-fg">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={`${MARKETING_CONTAINER} pb-[64px]`}>
          <div className="kv-gradient relative overflow-hidden rounded-[16px] px-[24px] py-[40px] text-center text-white sm:py-[52px]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[url('/dashboard/card-pattern.svg')] bg-center opacity-[0.25] invert"
            />
            <div className="relative">
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] sm:text-[30px]">Belum yakin mulai dari mana?</h2>
              <p className="mx-auto mt-[10px] max-w-[480px] text-[14px] leading-[1.6] text-white/70">
                Mulai dari Gratis. Saat katalog, kursus, atau tim tumbuh, upgrade ke Pro untuk membuka
                membership, afiliasi, dan analytics.
              </p>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="mt-[22px] border-white bg-white text-kv-fg hover:bg-white/90 hover:text-kv-fg"
              >
                <Link href={isAuthed ? "/dashboard" : "/register"}>
                  {isAuthed ? "Buka dashboard" : "Mulai gratis"}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function formatLimit(limit: number | null, noun: string) {
  if (limit == null) return "Tanpa batas";
  return `${limit.toLocaleString("id-ID")} ${noun}`;
}
