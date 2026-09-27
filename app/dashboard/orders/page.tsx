import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackageX,
  ShieldCheck,
  Truck,
  Wallet,
  Download,
  Search,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatPrice } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { FulfillmentStatusBadge } from "@/components/orders/fulfillment-status-badge";
import { TrackingImportDialog } from "@/components/orders/tracking-import-dialog";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";
import { bulkUpdateOrdersAction } from "@/lib/actions/order";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Orders · My Landing" };

const PAGE_SIZE = 25;

const ORDER_FILTERS: {
  label: string;
  description: string;
  icon: typeof Clock3;
  statuses: OrderStatus[];
}[] = [
  {
    label: "Menunggu Pembayaran",
    description: "Customer belum menyelesaikan checkout",
    icon: Wallet,
    statuses: ["PENDING"],
  },
  {
    label: "Menunggu Verifikasi",
    description: "Pembayaran masuk dan perlu dicek",
    icon: ShieldCheck,
    statuses: ["PAID"],
  },
  {
    label: "Sudah Dibayar",
    description: "Order paid siap diproses",
    icon: CheckCircle2,
    statuses: ["PAID"],
  },
  {
    label: "Diproses",
    description: "Pesanan sedang dikemas",
    icon: PackageCheck,
    statuses: ["PROCESSING"],
  },
  {
    label: "Dalam Pengiriman",
    description: "Gunakan status processing untuk shipment",
    icon: Truck,
    statuses: ["PROCESSING"],
  },
  {
    label: "Selesai",
    description: "Order completed",
    icon: CheckCircle2,
    statuses: ["COMPLETED"],
  },
  {
    label: "Dibatalkan",
    description: "Order cancelled or failed",
    icon: PackageX,
    statuses: ["CANCELLED", "FAILED"],
  },
  {
    label: "Kadaluwarsa",
    description: "Payment expired",
    icon: Clock3,
    statuses: ["EXPIRED"],
  },
];

const VALID_STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
  "EXPIRED",
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string; q?: string; payment?: string; courier?: string; from?: string; to?: string; attention?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const page = parsePage(searchParams.page);
  const selectedStatus = VALID_STATUSES.includes(searchParams.status as OrderStatus)
    ? (searchParams.status as OrderStatus)
    : null;
  const q = searchParams.q?.trim().slice(0, 100) || "";
  const payment = ["PENDING", "PAID", "FAILED", "EXPIRED", "CANCELLED"].includes(searchParams.payment || "") ? searchParams.payment : null;
  const from = searchParams.from ? new Date(searchParams.from) : null;
  const to = searchParams.to ? new Date(`${searchParams.to}T23:59:59.999`) : null;
  const onlyAttention = searchParams.attention === "1";
  const where: Prisma.OrderWhereInput = {
    workspaceId: workspace.id,
    ...(onlyAttention ? { needsAttention: true } : {}),
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(payment ? { payment: { is: { status: payment as never } } } : {}),
    ...(searchParams.courier ? { shippingCourier: { equals: searchParams.courier, mode: "insensitive" } } : {}),
    ...(from || to ? { createdAt: { ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}) } } : {}),
    ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { invoiceNumber: { contains: q, mode: "insensitive" } }, { customerNameSnapshot: { contains: q, mode: "insensitive" } }, { customerEmailSnapshot: { contains: q, mode: "insensitive" } }, { customer: { is: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } } }] } : {}),
  };

  const [total, allTotal, attentionCount, statusAgg, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: { workspaceId: workspace.id } }),
    prisma.order.count({ where: { workspaceId: workspace.id, needsAttention: true } }),
    prisma.order.groupBy({
      by: ["status"],
      where: { workspaceId: workspace.id },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where,
      include: {
        customer: true,
        payment: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const statusCount = new Map(statusAgg.map((row) => [row.status, row._count._all]));

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Pesanan"
        description="Kelola dan pantau semua pesanan masuk."
      />

      {attentionCount > 0 ? (
        <Link
          href={onlyAttention ? "/dashboard/orders" : "/dashboard/orders?attention=1"}
          className="mb-4 flex items-start gap-3 rounded-lg border border-zinc-300 bg-zinc-100 p-3 transition hover:bg-zinc-100 dark:border-zinc-700/60 dark:bg-zinc-800/30"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-800" />
          <span className="min-w-0 flex-1 text-sm text-zinc-900 dark:text-zinc-200">
            <span className="font-semibold">
              {attentionCount} pesanan sudah dibayar tapi perlu dicek.
            </span>{" "}
            Stok atau kupon habis tepat saat pembayaran masuk.{" "}
            {onlyAttention ? "Tampilkan semua pesanan." : "Lihat pesanannya."}
          </span>
        </Link>
      ) : null}

      <form className="mb-6 grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[minmax(0,1fr)_150px_130px_130px_auto] dark:border-zinc-800">
        {selectedStatus ? <input type="hidden" name="status" value={selectedStatus} /> : null}
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input name="q" defaultValue={q} placeholder="Order, invoice, customer" className="h-9 w-full rounded-md border border-zinc-200 bg-transparent pl-9 pr-3 text-sm dark:border-zinc-700" /></label>
        <select name="payment" defaultValue={payment || ""} className="h-9 rounded-md border border-zinc-200 bg-transparent px-2 text-sm dark:border-zinc-700"><option value="">Semua payment</option>{["PENDING","PAID","FAILED","EXPIRED","CANCELLED"].map((value) => <option key={value}>{value}</option>)}</select>
        <input name="from" type="date" defaultValue={searchParams.from || ""} className="h-9 rounded-md border border-zinc-200 bg-transparent px-2 text-sm dark:border-zinc-700" />
        <input name="to" type="date" defaultValue={searchParams.to || ""} className="h-9 rounded-md border border-zinc-200 bg-transparent px-2 text-sm dark:border-zinc-700" />
        <Button type="submit" size="sm">Filter</Button>
      </form>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER_FILTERS.map((filter) => {
          const Icon = filter.icon;
          const count = filter.statuses.reduce(
            (sum, status) => sum + (statusCount.get(status) ?? 0),
            0
          );
          const firstStatus = filter.statuses[0];
          const active = selectedStatus === firstStatus;
          return (
            <Link
              key={filter.label}
              href={`/dashboard/orders?status=${firstStatus}`}
              className={`rounded-lg border p-4 transition hover:border-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                active
                  ? "border-zinc-900 ring-1 ring-zinc-900 dark:border-zinc-50 dark:ring-zinc-50"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {filter.label}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {count.toLocaleString("id-ID")} orders
                  </span>
                </span>
                <span className="mt-1 h-3.5 w-3.5 rounded-full border border-zinc-300 dark:border-zinc-700">
                  {active ? (
                    <span className="block h-full w-full rounded-full bg-zinc-900 ring-2 ring-white dark:bg-zinc-50 dark:ring-zinc-950" />
                  ) : null}
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      <div className="mt-6 flex items-center gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <Link
          href="/dashboard/orders"
          className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium ${
            !selectedStatus
              ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          Semua Pesanan
          <Badge variant="secondary">{allTotal.toLocaleString("id-ID")}</Badge>
        </Link>
        {selectedStatus ? <OrderStatusBadge status={selectedStatus} /> : null}
      </div>

      <form action={bulkUpdateOrdersAction}>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><select name="bulkStatus" defaultValue="PROCESSING" className="h-9 rounded-md border border-zinc-200 bg-transparent px-2 text-sm dark:border-zinc-700"><option value="PROCESSING">Set processing</option><option value="COMPLETED">Set completed</option><option value="CANCELLED">Cancel orders</option></select><Button type="submit" variant="outline" size="sm">Terapkan ke pilihan</Button></div>
        <div className="flex items-center gap-2">
          <TrackingImportDialog />
          <Button asChild variant="outline" size="sm"><a href={`/dashboard/orders/export?${new URLSearchParams({ ...(selectedStatus ? { status: selectedStatus } : {}), ...(q ? { q } : {}) }).toString()}`}><Download /> Export CSV</a></Button>
        </div>
      </div>
      <Card className="mt-3">
        <CardContent className="p-0">
          {total === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={PackageCheck}
                title={selectedStatus ? "Belum ada data pesanan untuk status ini" : "Belum ada pesanan"}
                description="Pesanan akan muncul setelah customer checkout dari storefront."
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 pl-4"><span className="sr-only">Pilih</span></TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>Pembeli</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total harga</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fulfillment</TableHead>
                    <TableHead>Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="pl-4"><input type="checkbox" name="orderIds" value={order.id} aria-label={`Pilih ${order.orderNumber}`} /></TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                        >
                          {order.orderNumber}
                        </Link>
                        {order.needsAttention ? (
                          <p
                            className="mt-1 flex items-start gap-1 text-[11px] leading-4 text-zinc-800 dark:text-zinc-400"
                            title={order.attentionReason ?? undefined}
                          >
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="line-clamp-2">
                              {order.attentionReason ?? "Perlu dicek"}
                            </span>
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-zinc-900 dark:text-zinc-50">
                          {order.customer?.name ?? order.customerNameSnapshot ?? "Guest"}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {order.customer?.email ?? order.customerEmailSnapshot ?? ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                        {order._count.items}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {formatPrice(order.total)}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>
                        <FulfillmentStatusBadge status={order.fulfillmentStatus} />
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(order.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t border-zinc-200/70 dark:border-zinc-800">
                <Pagination
                  page={page}
                  total={total}
                  pageSize={PAGE_SIZE}
                  basePath="/dashboard/orders"
                  params={{ status: selectedStatus ?? undefined }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </form>
    </div>
  );
}
