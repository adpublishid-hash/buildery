"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SaaSPlan, SaaSPlanTier } from "@prisma/client";
import {
  ArrowRight,
  BarChart3,
  Check,
  Gauge,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import {
  startPlanCheckoutAction,
  subscribeToPlanAction,
  type CheckoutInvoice,
} from "@/lib/actions/subscription";
import { getMonthlyPlanPricing } from "@/lib/billing-pricing";
import { cn, formatPrice } from "@/lib/utils";

type Props = {
  plans: SaaSPlan[];
  currentTier: SaaSPlanTier | null;
  isAuthenticated: boolean;
  loginCallbackUrl?: string;
};
type VisiblePlanTier = Exclude<SaaSPlanTier, "BUSINESS">;
type VisiblePlan = SaaSPlan & { tier: VisiblePlanTier };

const HIGHLIGHT_TIER: VisiblePlanTier = "PRO";

const PLAN_META: Record<
  VisiblePlanTier,
  {
    eyebrow: string;
    summary: string;
    bestFor: string;
    cta: string;
    accent: string;
    icon: typeof Sparkles;
    guarantee: string;
  }
> = {
  FREE: {
    eyebrow: "Eksperimen",
    summary: "Bangun halaman pertama dan toko kecil tanpa biaya.",
    bestFor: "Validasi ide, profile link, dan landing page pertama.",
    cta: "Mulai gratis",
    accent: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    icon: Sparkles,
    guarantee: "Tanpa kartu kredit. Cocok untuk mulai hari ini.",
  },
  STARTER: {
    eyebrow: "Mulai jualan",
    summary: "Kapasitas lebih lega untuk mulai publish rutin dan jual produk.",
    bestFor: "Solo creator atau brand kecil yang mulai publish dan jualan rutin.",
    cta: "Pilih Starter",
    accent:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    icon: Gauge,
    guarantee: "Naik level dari halaman pertama ke sistem jualan rapi.",
  },
  PRO: {
    eyebrow: "Paling pas",
    summary: "Sistem lengkap untuk menjual produk, course, membership, dan afiliasi.",
    bestFor:
      "Bisnis yang butuh toko, kursus, membership, afiliasi, dan analytics.",
    cta: "Pilih Pro",
    accent: "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950",
    icon: ShieldCheck,
    guarantee: "Plan terbaik untuk menjual produk, course, dan konten premium.",
  },
};

export function PricingCards({
  plans,
  currentTier,
  isAuthenticated,
  loginCallbackUrl = "/pricing",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<CheckoutInvoice | null>(null);

  function choose(plan: SaaSPlan) {
    if (!isAuthenticated) {
      router.push(`/login?callbackUrl=${encodeURIComponent(loginCallbackUrl)}`);
      return;
    }
    setPendingPlanId(plan.id);

    // Tagihan diterbitkan server: nomor, kode unik, dan nominalnya tercatat
    // supaya admin bisa mencocokkan transfer yang masuk.
    if (plan.monthlyPrice > 0) {
      startTransition(async () => {
        const res = await startPlanCheckoutAction(plan.id);
        setPendingPlanId(null);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setInvoice(res.data ?? null);
      });
      return;
    }

    startTransition(async () => {
      const res = await subscribeToPlanAction(plan.id);
      setPendingPlanId(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Plan ${plan.name} aktif`);
      router.push("/dashboard/billing");
      router.refresh();
    });
  }

  const visiblePlans = plans.filter(
    (plan): plan is VisiblePlan => plan.tier !== "BUSINESS"
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
        {visiblePlans.map((plan) => {
          const isCurrent = currentTier === plan.tier;
          const isHighlight = plan.tier === HIGHLIGHT_TIER;
          const isPending = pending && pendingPlanId === plan.id;
          const meta = PLAN_META[plan.tier];
          const pricing = getMonthlyPlanPricing(plan);
          const Icon = meta.icon;
          const features = getPlanBenefits(plan);
          const premiumFeatures = [
            {
              label: "Program afiliasi",
              icon: Users,
              enabled: plan.hasAffiliate,
            },
            {
              label: "Tier membership",
              icon: ShieldCheck,
              enabled: plan.hasMembership,
            },
            {
              label: "Analytics lanjutan",
              icon: BarChart3,
              enabled: plan.hasAdvancedAnalytics,
            },
          ];

          return (
            <article
              key={plan.id}
              className={cn(
                "kv-frame group relative flex flex-col p-[4px]",
                isHighlight && "shadow-[inset_0_0_0_1px_#1f2937]"
              )}
            >
              <div className="flex h-[30px] items-center justify-between gap-[8px] px-[8px]">
                <span className="flex items-center gap-[6px] text-[13px] font-medium leading-none text-kv-secondary-fg">
                  <Icon className="h-[14px] w-[14px]" strokeWidth={1.6} />
                  {meta.eyebrow}
                </span>
                {isCurrent ? (
                  <span className="inline-flex h-[18px] items-center gap-[5px] rounded-[6px] border-[0.8px] border-kv-border bg-kv-card px-[6px] text-[11px] font-medium text-kv-secondary-fg before:h-[6px] before:w-[6px] before:rounded-full before:bg-kv-success before:content-['']">
                    Aktif
                  </span>
                ) : isHighlight ? (
                  <span className="kv-gradient inline-flex h-[18px] items-center rounded-[6px] px-[7px] text-[11px] font-medium text-white">
                    Rekomendasi
                  </span>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col rounded-[10px] border-[0.8px] border-kv-border bg-kv-card p-[16px] text-left transition-[box-shadow,transform] duration-300 ease-out-expo group-hover:-translate-y-px group-hover:shadow-kv-hover">
                <h2 className="text-[16px] font-semibold text-kv-fg">{plan.name}</h2>

                <div className="mt-[10px]">
                  {pricing.hasDiscount ? (
                    <div className="mb-[4px] flex items-center gap-[6px] text-[12px]">
                      <span className="text-kv-subtle line-through">{formatPrice(pricing.listPrice)}</span>
                      <span className="font-medium text-kv-success">Hemat {pricing.discountPercent}%</span>
                    </div>
                  ) : null}
                  <div className="flex items-end gap-[4px]">
                    <p className="kv-tabular text-[28px] font-semibold leading-none tracking-[-0.02em] text-kv-fg">
                      {plan.monthlyPrice === 0 ? "Gratis" : formatPrice(pricing.payablePrice)}
                    </p>
                    {plan.monthlyPrice > 0 ? (
                      <span className="pb-[2px] text-[13px] text-kv-muted-fg">/bulan</span>
                    ) : null}
                  </div>
                  <p className="mt-[10px] min-h-[40px] text-[13px] leading-[1.5] text-kv-muted-fg">{meta.summary}</p>
                </div>

                <div className="kv-dash-x my-[14px] w-full" />

                <ul className="space-y-[8px] text-[13px]">
                  {features.slice(0, 7).map((feature) => (
                    <li key={feature} className="flex items-start gap-[8px] text-kv-cell">
                      <Check className="mt-[2px] h-[14px] w-[14px] shrink-0 text-kv-success" strokeWidth={2} />
                      <span className="leading-[1.45]">{feature}</span>
                    </li>
                  ))}
                  {premiumFeatures
                    .filter((feature) => !feature.enabled)
                    .map((feature) => (
                      <li key={feature.label} className="flex items-start gap-[8px] text-kv-subtle">
                        <X className="mt-[2px] h-[14px] w-[14px] shrink-0" strokeWidth={2} />
                        <span className="leading-[1.45]">{feature.label}</span>
                      </li>
                    ))}
                </ul>

                <div className="mt-auto pt-[18px]">
                  <Button
                    type="button"
                    size="lg"
                    variant={isCurrent ? "outline" : isHighlight ? "default" : "outline"}
                    disabled={isCurrent || pending}
                    onClick={() => choose(plan)}
                    className="w-full"
                  >
                    {isPending ? <Loader2 className="animate-spin" /> : null}
                    {isCurrent ? "Plan aktif" : meta.cta}
                    {!isCurrent && !isPending ? <ArrowRight /> : null}
                  </Button>
                  <p className="mt-[8px] text-center text-[11px] text-kv-subtle">
                    {plan.monthlyPrice === 0 ? "Bisa upgrade kapan saja." : "Ganti atau batalkan dari billing."}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <PaymentDialog
        invoice={invoice}
        onOpenChange={(open) => {
          if (!open) {
            setInvoice(null);
            router.refresh();
          }
        }}
      />
    </>
  );
}

function getPlanBenefits(plan: SaaSPlan) {
  const benefits = [
    `${formatLimitId(plan.workspaceLimit, "workspace")} untuk brand atau project`,
    `${formatLimitId(plan.memberLimit, "anggota")} per workspace`,
    `${formatLimitId(plan.pageLimit, "halaman")} landing page dan halaman custom`,
    `${formatLimitId(plan.productLimit, "produk")} fisik atau digital`,
  ];

  if (plan.courseLimit !== 0) {
    benefits.push(`${formatLimitId(plan.courseLimit, "kursus")} online dengan modul dan lesson`);
  }
  benefits.push(
    plan.formLimit === 0
      ? "Website builder, blog, checkout, dan hosting publik"
      : "Website builder, blog, form, checkout, dan hosting publik"
  );
  if (plan.monthlyOrderLimit != null) {
    benefits.push(`${plan.monthlyOrderLimit.toLocaleString("id-ID")} order per bulan`);
  }
  if (plan.orderRetentionMonths != null) {
    benefits.push(`Riwayat order tersimpan ${plan.orderRetentionMonths} bulan`);
  }

  if (plan.hasMembership) {
    benefits.push("Membership tier untuk mengunci konten premium");
  }
  if (plan.hasAffiliate) {
    benefits.push("Program afiliasi dengan link referral dan komisi");
  }
  if (plan.hasAdvancedAnalytics) {
    benefits.push("Analytics lanjutan untuk traffic, order, dan revenue");
  }
  if (plan.customDomainEnabled) {
    benefits.push("Custom domain dengan verifikasi kepemilikan dan HTTPS");
  }

  return benefits;
}

function formatLimitId(limit: number | null, unit: string) {
  if (limit === null) return `${unit} tanpa batas`;
  return `${limit.toLocaleString("id-ID")} ${unit}`;
}

