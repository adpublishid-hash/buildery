import { Receipt } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { InvoiceReview } from "@/components/admin/invoice-review";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { OPEN_INVOICE_STATUSES } from "@/lib/saas-billing";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Prisma, SaaSInvoiceStatus } from "@prisma/client";

export const metadata = { title: "Invoices · Admin" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "Menunggu pembayaran",
  AWAITING_VERIFICATION: "Menunggu verifikasi",
  PAID: "Lunas",
  REJECTED: "Ditolak",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
};

function formatDateTimeId(value: Date) {
  return value.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams?: { page?: string; q?: string; status?: string };
}) {
  await requireSuperAdmin();
  const page = parsePage(searchParams?.page);
  const q = searchParams?.q?.trim() ?? "";
  const status = Object.keys(STATUS_LABEL).includes(searchParams?.status ?? "") ? searchParams?.status as SaaSInvoiceStatus : undefined;
  const historyWhere: Prisma.SaaSInvoiceWhereInput = { ...(status ? { status } : { status: { notIn: ["AWAITING_VERIFICATION"] } }), ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }, { user: { name: { contains: q, mode: "insensitive" } } }] } : {}) };
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [pendingReview, recent, totalRecent, paidThisMonth] = await Promise.all([
    prisma.saaSInvoice.findMany({
      where: { status: "AWAITING_VERIFICATION" },
      orderBy: { proofSubmittedAt: "asc" },
      include: {
        user: { select: { name: true, email: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.saaSInvoice.findMany({
      where: historyWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { name: true, email: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.saaSInvoice.count({
      where: historyWhere,
    }),
    prisma.saaSInvoice.aggregate({
      where: { status: "PAID", paidAt: { gte: monthStart } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
  ]);

  const openCount = await prisma.saaSInvoice.count({
    where: { status: { in: [...OPEN_INVOICE_STATUSES] } },
  });

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Invoices"
        description="Antrean verifikasi pembayaran QRIS. Menyetujui tagihan langsung mengaktifkan plan pelanggan."
      />

      <AdminFilterBar action="/admin/invoices" query={q} status={status} options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} extra={<Button asChild variant="outline"><Link href={`/admin/invoices/export?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`}>Export CSV</Link></Button>} />

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Menunggu verifikasi"
          value={String(pendingReview.length)}
          delta="Butuh tindakan admin"
          trend={pendingReview.length > 0 ? "up" : "neutral"}
          icon={Receipt}
        />
        <StatCard
          label="Tagihan terbuka"
          value={String(openCount)}
          delta="Belum selesai"
          trend="neutral"
          icon={Receipt}
        />
        <StatCard
          label="Diterima bulan ini"
          value={formatPrice(paidThisMonth._sum.totalAmount ?? 0)}
          delta={`${paidThisMonth._count._all} pembayaran lunas`}
          trend="up"
          icon={Receipt}
        />
      </section>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Menunggu verifikasi</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingReview.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Tidak ada bukti transfer yang menunggu. Antrean bersih.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendingReview.map((invoice) => (
                <div
                  key={invoice.id}
                  className="rounded-lg border border-zinc-200 p-4"
                >
                  <p className="font-mono text-sm text-zinc-900">
                    {invoice.number}
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">
                    {invoice.user.name ?? invoice.user.email}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {invoice.user.email} · {invoice.plan.name}
                  </p>

                  <dl className="mt-3 space-y-1 text-xs text-zinc-600">
                    <div className="flex justify-between">
                      <dt>Harga plan</dt>
                      <dd>{formatPrice(invoice.promoPrice)}</dd>
                    </div>
                    {invoice.proratedCredit > 0 ? (
                      <div className="flex justify-between">
                        <dt>Potongan upgrade</dt>
                        <dd>-{formatPrice(invoice.proratedCredit)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between">
                      <dt>Kode unik</dt>
                      <dd>+{invoice.uniqueCode.toLocaleString("id-ID")}</dd>
                    </div>
                    <div className="flex justify-between border-t border-zinc-100 pt-1 text-sm font-semibold text-zinc-900">
                      <dt>Harus masuk</dt>
                      <dd>{formatPrice(invoice.totalAmount)}</dd>
                    </div>
                  </dl>

                  {invoice.proofSubmittedAt ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      Dikirim {formatDateTimeId(invoice.proofSubmittedAt)}
                    </p>
                  ) : null}

                  {invoice.proofUrl ? (
                    <a
                      href={invoice.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 block overflow-hidden rounded-md border border-zinc-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={invoice.proofUrl}
                        alt={`Bukti transfer ${invoice.number}`}
                        className="max-h-56 w-full object-contain"
                      />
                    </a>
                  ) : null}

                  {invoice.proofNote ? (
                    <p className="mt-2 rounded-md bg-zinc-50 p-2 text-xs text-zinc-600">
                      {invoice.proofNote}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <InvoiceReview
                      invoiceId={invoice.id}
                      invoiceNumber={invoice.number}
                      amountLabel={formatPrice(invoice.totalAmount)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {totalRecent === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Receipt}
                title="Belum ada tagihan"
                description="Tagihan muncul di sini setelah pelanggan memilih plan berbayar."
              />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recent.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-zinc-900">
                      {invoice.number}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {invoice.user.email} · {invoice.plan.name} ·{" "}
                      {formatDateTimeId(invoice.paidAt ?? invoice.createdAt)}
                    </p>
                    {invoice.reviewNote ? (
                      <p className="mt-0.5 text-xs text-red-600">
                        {invoice.reviewNote}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-900">
                      {formatPrice(invoice.totalAmount)}
                    </span>
                    <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600">
                      {STATUS_LABEL[invoice.status] ?? invoice.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={totalRecent}
        basePath="/admin/invoices"
        params={{ q: q || undefined, status }}
      />
    </div>
  );
}
