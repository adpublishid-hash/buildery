import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, X } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLimitSummaries, getUserPlan } from "@/lib/saas-limits";
import {
  getBillingSettings,
  getOpenInvoice,
  getUserInvoices,
} from "@/lib/saas-billing";
import {
  getMonthlyPlanPricing,
  isSubscriptionEntitled,
} from "@/lib/billing-pricing";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { SubscriptionControls } from "@/components/billing/subscription-controls";
import { OpenInvoiceCard } from "@/components/billing/open-invoice-card";
import type { CheckoutInvoice } from "@/lib/actions/subscription";
import { cn } from "@/lib/utils";

export const metadata = { title: "Billing · My Landing" };
export const dynamic = "force-dynamic";

const LIMIT_LABEL_ID: Record<string, string> = {
  workspace: "Workspace",
  page: "Halaman",
  product: "Produk",
  course: "Kursus",
  blog: "Artikel blog",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktif",
  PAST_DUE: "Jatuh tempo",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Berakhir",
};

const INVOICE_STATUS: Record<string, { label: string; tone: string }> = {
  AWAITING_PAYMENT: {
    label: "Menunggu pembayaran",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  AWAITING_VERIFICATION: {
    label: "Menunggu verifikasi",
    tone: "border-blue-200 bg-blue-50 text-blue-800",
  },
  PAID: {
    label: "Lunas",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  REJECTED: {
    label: "Ditolak",
    tone: "border-red-200 bg-red-50 text-red-800",
  },
  EXPIRED: {
    label: "Kedaluwarsa",
    tone: "border-zinc-200 bg-zinc-50 text-zinc-600",
  },
  CANCELLED: {
    label: "Dibatalkan",
    tone: "border-zinc-200 bg-zinc-50 text-zinc-600",
  },
};

function formatDateId(value: Date) {
  return value.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/billing");

  const now = new Date();
  const [plan, subscription, limits, invoices, openInvoice, settings] =
    await Promise.all([
      getUserPlan(session.user.id),
      prisma.saaSSubscription.findUnique({
        where: { userId: session.user.id },
      }),
      getLimitSummaries(session.user.id),
      getUserInvoices(session.user.id),
      getOpenInvoice(session.user.id, now),
      getBillingSettings(),
    ]);

  const isPaid = plan.monthlyPrice > 0;
  const pricing = getMonthlyPlanPricing(plan);
  const entitled = subscription ? isSubscriptionEntitled(subscription, now) : false;
  const periodEnd = subscription?.currentPeriodEnd ?? null;
  const periodEndLabel = periodEnd ? formatDateId(periodEnd) : null;

  const checkoutInvoice: CheckoutInvoice | null = openInvoice
    ? {
        id: openInvoice.id,
        number: openInvoice.number,
        planName: openInvoice.plan.name,
        listPrice: openInvoice.listPrice,
        promoPrice: openInvoice.promoPrice,
        proratedCredit: openInvoice.proratedCredit,
        uniqueCode: openInvoice.uniqueCode,
        totalAmount: openInvoice.totalAmount,
        expiresAt: openInvoice.expiresAt.toISOString(),
        status: openInvoice.status,
        proofUrl: openInvoice.proofUrl,
        qrisImageUrl: settings.qrisImageUrl,
        qrisMerchantName: settings.qrisMerchantName,
        whatsappNumber: settings.whatsappNumber,
        paymentInstruction: settings.paymentInstruction,
        // Tagihan ini sudah terbit; peringatan kuota adalah hal yang
        // ditampilkan sebelum membayar, bukan sesudah.
        warnings: [],
      }
    : null;

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Billing"
        description="Kelola langganan dan lihat pemakaian kuota plan-mu."
        action={
          <Button asChild>
            <Link href="/pricing">
              {isPaid ? "Ganti plan" : "Pilih plan"}
            </Link>
          </Button>
        }
      />

      {checkoutInvoice ? <OpenInvoiceCard invoice={checkoutInvoice} /> : null}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>
                {plan.description ?? "Plan My Landing kamu saat ini."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isPaid && pricing.hasDiscount ? (
                <span className="text-sm text-zinc-400 line-through">
                  {formatPrice(pricing.listPrice)}
                </span>
              ) : null}
              <Badge variant={isPaid ? "default" : "secondary"}>
                {isPaid ? `${formatPrice(plan.monthlyPrice)}/bulan` : "Gratis"}
              </Badge>
              {subscription ? (
                <Badge
                  variant={
                    subscription.status === "ACTIVE" ? "success" : "outline"
                  }
                >
                  {STATUS_LABEL[subscription.status] ?? subscription.status}
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FeatureRow label="Program afiliasi" enabled={plan.hasAffiliate} />
            <FeatureRow label="Tier membership" enabled={plan.hasMembership} />
            <FeatureRow
              label="Analytics lanjutan"
              enabled={plan.hasAdvancedAnalytics}
            />
          </div>

          {isPaid && periodEndLabel ? (
            <p className="mt-4 text-xs text-zinc-500">
              {subscription?.cancelAtPeriodEnd
                ? `Perpanjangan dibatalkan. Plan aktif sampai ${periodEndLabel}, lalu turun ke Gratis.`
                : subscription?.status === "PAST_DUE"
                  ? `Jatuh tempo ${periodEndLabel}. Akses berbayar masih berlaku sampai ${
                      subscription.graceUntil
                        ? formatDateId(subscription.graceUntil)
                        : periodEndLabel
                    }.`
                  : `Perpanjang sebelum ${periodEndLabel}.`}
            </p>
          ) : null}

          {isPaid && !periodEndLabel ? (
            <p className="mt-4 text-xs text-zinc-500">
              Tidak ada tanggal jatuh tempo — plan ini diberikan langsung oleh
              admin.
            </p>
          ) : null}

          {subscription && isPaid && entitled ? (
            <div className="mt-4">
              <SubscriptionControls
                cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
                periodEndLabel={periodEndLabel}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pemakaian</CardTitle>
          <CardDescription>
            Kuota dihitung dari seluruh workspace yang kamu miliki. Upgrade untuk
            menambah kapasitas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {limits.map((l) => {
            const pct =
              l.limit == null
                ? 0
                : Math.min(
                    100,
                    Math.round((l.used / Math.max(l.limit, 1)) * 100)
                  );
            const over = l.limit != null && l.used >= l.limit;
            return (
              <div key={l.kind} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">
                    {LIMIT_LABEL_ID[l.kind] ?? l.label}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      over ? "font-semibold text-zinc-900" : "text-zinc-500"
                    )}
                  >
                    {l.used} / {l.limit == null ? "Tanpa batas" : l.limit}
                  </span>
                </div>
                {l.limit != null ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={cn(
                        "h-full",
                        over
                          ? "bg-[repeating-linear-gradient(45deg,#18181b_0_5px,#a1a1aa_5px_10px)]"
                          : "bg-zinc-900"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat tagihan</CardTitle>
          <CardDescription>
            Bukti pembayaran untuk pembukuanmu. Nominal sudah termasuk kode unik.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Belum ada tagihan. Tagihan muncul di sini setelah kamu memilih plan
              berbayar.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {invoices.map((invoice) => {
                const status =
                  INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.CANCELLED;
                return (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-zinc-900">
                        {invoice.number}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {invoice.plan.name} ·{" "}
                        {formatDateId(invoice.paidAt ?? invoice.createdAt)}
                        {invoice.proratedCredit > 0
                          ? ` · potongan ${formatPrice(invoice.proratedCredit)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-zinc-900">
                        {formatPrice(invoice.totalAmount)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          status.tone
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200/70 px-3 py-2 text-sm">
      {enabled ? (
        <Check className="h-4 w-4 text-zinc-800" />
      ) : (
        <X className="h-4 w-4 text-zinc-300" />
      )}
      <span className={enabled ? "text-zinc-900" : "text-zinc-400"}>
        {label}
      </span>
    </div>
  );
}
