import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, FileText, Mail, MessageCircle, PackageCheck, Send, Wallet } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatPrice } from "@/lib/store";
import { isMidtransConfigured } from "@/lib/midtrans";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderStatusControl } from "@/components/orders/order-status-control";
import { FulfillmentStatusBadge } from "@/components/orders/fulfillment-status-badge";
import { OrderFulfillmentPanel } from "@/components/orders/order-fulfillment-panel";
import { OrderRefundPanel } from "@/components/orders/order-refund-panel";
import { PaymentCancelButton } from "@/components/orders/payment-cancel-button";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ManualPaymentProofPanel } from "@/components/orders/manual-payment-proof-panel";

export const metadata = { title: "Order · My Landing" };

export default async function OrderDetailPage({
  params,
}: {
  params: { orderId: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      customer: true,
      items: { include: { product: { select: { type: true } } } },
      payment: true,
      coupon: true,
      notifications: { orderBy: { createdAt: "desc" } },
      refunds: {
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            include: {
              orderItem: { select: { nameSnapshot: true } },
              product: { select: { type: true } },
            },
          },
          evidence: { orderBy: { createdAt: "asc" } },
        },
      },
      fulfillmentEvents: {
        orderBy: { createdAt: "desc" },
        take: 12,
      },
      commissions: {
        include: {
          affiliate: {
            include: { customer: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });
  if (!order || order.workspaceId !== workspace.id) {
    notFound();
  }
  const needsFulfillment =
    order.fulfillmentStatus !== "NOT_REQUIRED" ||
    Boolean(order.shippingAddress) ||
    order.items.some((item) => item.product?.type === "PHYSICAL");
  const manualPayment = readManualPayment(order.payment?.rawNotification);
  const canProcessProviderRefund =
    isMidtransConfigured() &&
    order.payment?.provider === "midtrans" &&
    order.payment.status === "PAID";
  const canCancelProviderPayment =
    canEdit &&
    isMidtransConfigured() &&
    order.payment?.provider === "midtrans" &&
    !["SHIPPED", "DELIVERED"].includes(order.fulfillmentStatus) &&
    (order.payment.status === "PENDING" ||
      (order.payment.status === "PAID" &&
        ["capture", "authorize"].includes(
          order.payment.transactionStatus ?? ""
        )));

  return (
    <div className="w-full min-w-0">
      <Link
        href="/dashboard/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to orders
      </Link>

      <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {order.orderNumber}
            </h1>
            <OrderStatusBadge status={order.status} />
            <FulfillmentStatusBadge status={order.fulfillmentStatus} />
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Placed {formatDate(order.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/orders/${order.id}/invoice`} target="_blank">
              <FileText /> Invoice
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/orders/${order.id}/invoice?mode=packing`} target="_blank">
              <PackageCheck /> Packing slip
            </Link>
          </Button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Update status
          </span>
          <OrderStatusControl
            orderId={order.id}
            status={order.status}
            disabled={!canEdit}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Product</TableHead>
                    <TableHead>Unit price</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="pr-6 text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="pl-6 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {item.nameSnapshot}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                        {formatPrice(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="pr-6 text-right text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {formatPrice(item.unitPrice * item.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="space-y-1.5 border-t border-zinc-200/70 px-6 py-3 text-sm dark:border-zinc-800">
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                  <span>Subtotal</span>
                  <span>{formatPrice(order.subtotal)}</span>
                </div>
                {order.discount > 0 ? (
                  <div className="flex justify-between text-zinc-800">
                    <span>
                      Coupon
                      {order.coupon ? (
                        <span className="ml-1 font-mono text-[11px]">
                          {order.coupon.code}
                        </span>
                      ) : null}
                    </span>
                    <span>− {formatPrice(order.discount)}</span>
                  </div>
                ) : null}
                {order.shippingCost > 0 ? (
                  <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                    <span>
                      Ongkir
                      {order.shippingCourier ? (
                        <span className="ml-1 text-[11px] uppercase">
                          {order.shippingCourier}
                          {order.shippingService ? ` ${order.shippingService}` : ""}
                        </span>
                      ) : null}
                    </span>
                    <span>{formatPrice(order.shippingCost)}</span>
                  </div>
                ) : null}
                {order.taxAmount > 0 ? (
                  <div className="flex justify-between text-zinc-500 dark:text-zinc-400"><span>Pajak</span><span>{formatPrice(order.taxAmount)}</span></div>
                ) : null}
                <div className="flex justify-between pt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  <span>Total</span>
                  <span>{formatPrice(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {order.shippingAddress || order.shippingMethodType === "PICKUP" ? (
            <Card>
              <CardHeader>
                <CardTitle>Pengiriman</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{order.shippingMethodName || order.shippingRecipientName}</p>
                {order.shippingRecipientPhone ? (
                  <p className="text-xs text-zinc-500">
                    {order.shippingRecipientPhone}
                  </p>
                ) : null}
                <p className="whitespace-pre-line text-zinc-600 dark:text-zinc-300">
                  {order.shippingAddress}
                </p>
                <p className="text-zinc-600 dark:text-zinc-300">
                  {[order.shippingCityName, order.shippingProvinceName, order.shippingPostalCode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {order.shippingCourier ? (
                  <p className="pt-1 text-xs text-zinc-500">
                    Kurir:{" "}
                    <span className="font-medium uppercase">
                      {order.shippingCourier}
                    </span>{" "}
                    {order.shippingService}
                    {order.shippingEtd ? (
                      <span className="text-zinc-400"> · ETA {order.shippingEtd} hari</span>
                    ) : null}
                  </p>
                ) : null}
                {order.fulfillmentTrackingNumber ||
                order.fulfillmentTrackingCarrier ||
                order.fulfillmentTrackingUrl ? (
                  <div className="mt-3 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      Tracking
                    </p>
                    <p className="mt-1 text-zinc-500">
                      {[order.fulfillmentTrackingCarrier, order.fulfillmentTrackingNumber]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {order.fulfillmentTrackingUrl ? (
                      <a
                        href={order.fulfillmentTrackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-zinc-900 underline dark:text-zinc-50"
                      >
                        Buka tracking
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {needsFulfillment ? (
            <OrderFulfillmentPanel
              orderId={order.id}
              status={order.fulfillmentStatus}
              trackingCarrier={order.fulfillmentTrackingCarrier}
              trackingNumber={order.fulfillmentTrackingNumber}
              trackingUrl={order.fulfillmentTrackingUrl}
              note={order.fulfillmentNote}
              packedAt={order.packedAt?.toISOString() ?? null}
              shippedAt={order.shippedAt?.toISOString() ?? null}
              deliveredAt={order.deliveredAt?.toISOString() ?? null}
              events={order.fulfillmentEvents.map((event) => ({
                id: event.id,
                status: event.status,
                trackingCarrier: event.trackingCarrier,
                trackingNumber: event.trackingNumber,
                trackingUrl: event.trackingUrl,
                note: event.note,
                createdAt: event.createdAt.toISOString(),
              }))}
              canEdit={canEdit}
            />
          ) : null}

          <OrderRefundPanel
            orderId={order.id}
            orderTotal={order.total}
            items={order.items.map((item) => ({
              id: item.id,
              productId: item.productId,
              name: item.nameSnapshot,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              productType: item.product?.type ?? null,
            }))}
            refunds={order.refunds.map((refund) => ({
              id: refund.id,
              type: refund.type,
              status: refund.status,
              amount: refund.amount,
              reason: refund.reason,
              note: refund.note,
              provider: refund.provider,
              providerRefundKey: refund.providerRefundKey,
              providerReference: refund.providerReference,
              providerStatus: refund.providerStatus,
              providerRequestedAt:
                refund.providerRequestedAt?.toISOString() ?? null,
              returnToStock: refund.returnToStock,
              restockedAt: refund.restockedAt?.toISOString() ?? null,
              approvedAt: refund.approvedAt?.toISOString() ?? null,
              rejectedAt: refund.rejectedAt?.toISOString() ?? null,
              refundedAt: refund.refundedAt?.toISOString() ?? null,
              cancelledAt: refund.cancelledAt?.toISOString() ?? null,
              createdAt: refund.createdAt.toISOString(),
              items: refund.items.map((item) => ({
                id: item.id,
                orderItemId: item.orderItemId,
                productId: item.productId,
                quantity: item.quantity,
                restockQuantity: item.restockQuantity,
                orderItemName: item.orderItem.nameSnapshot,
                productType: item.product?.type ?? null,
              })),
              evidence: refund.evidence.map((file) => ({
                id: file.id,
                url: file.url,
                name: file.name,
                mimeType: file.mimeType,
                size: file.size,
              })),
            }))}
            canProcessProviderRefund={canProcessProviderRefund}
            canEdit={canEdit}
          />

          {order.note ? (
            <Card>
              <CardHeader>
                <CardTitle>Customer note</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">
                  {order.note}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {order.customer?.name ?? order.customerNameSnapshot ?? "Guest"}
              </p>
              <p className="text-zinc-500 dark:text-zinc-400">
                {order.customer?.email ?? order.customerEmailSnapshot ?? "—"}
              </p>
              {order.customer?.phone || order.customerPhoneSnapshot ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  {order.customer?.phone ?? order.customerPhoneSnapshot}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Method
                </span>
                <span className="capitalize text-zinc-900 dark:text-zinc-50">
                  {manualPayment?.name ??
                    order.payment?.paymentType ??
                    order.payment?.provider ??
                    "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Status
                </span>
                <span className="text-zinc-900 dark:text-zinc-50">
                  {order.payment
                    ? order.payment.status.charAt(0) +
                      order.payment.status.slice(1).toLowerCase()
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Amount
                </span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {formatPrice(order.payment?.amount ?? order.total)}
                </span>
              </div>
              {order.payment?.transactionStatus ? (
                <div className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Provider status
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-50">
                    {order.payment.transactionStatus}
                  </span>
                </div>
              ) : null}
              {order.payment?.providerCancelStatus ? (
                <div className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Cancel status
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-50">
                    {order.payment.providerCancelStatus}
                  </span>
                </div>
              ) : null}
              {order.payment?.providerCancelRequestedAt ? (
                <div className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Cancel requested
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-50">
                    {formatDate(order.payment.providerCancelRequestedAt)}
                  </span>
                </div>
              ) : null}
              {canCancelProviderPayment ? (
                <div className="pt-2">
                  <PaymentCancelButton orderId={order.id} />
                </div>
              ) : null}
              {manualPayment ? (
                <div className="mt-3 rounded-lg border border-zinc-300 bg-zinc-100 p-3 text-zinc-950">
                  <div className="flex items-center gap-2 font-medium">
                    <Wallet className="h-4 w-4" />
                    Manual payment
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    {manualPayment.type === "QRIS" && manualPayment.qrImageUrl ? (
                      <div className="flex items-center gap-2 pt-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={manualPayment.qrImageUrl}
                          alt="QRIS"
                          className="h-24 w-24 rounded border border-zinc-200 bg-white object-contain p-1"
                        />
                        <span className="text-zinc-500">QRIS yang ditampilkan ke pembeli.</span>
                      </div>
                    ) : null}
                    {manualPayment.accountName ? (
                      <p>Atas nama: {manualPayment.accountName}</p>
                    ) : null}
                    {manualPayment.accountNumber ? (
                      <p className="font-mono">
                        Nomor: {manualPayment.accountNumber}
                      </p>
                    ) : null}
                    {manualPayment.instructions ? (
                      <p className="whitespace-pre-line pt-1 leading-5">
                        {manualPayment.instructions}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {order.payment?.manualProofUrl ? (
                <ManualPaymentProofPanel
                  paymentId={order.payment.id}
                  proofUrl={order.payment.manualProofUrl}
                  note={order.payment.manualProofNote}
                  status={order.payment.manualProofStatus}
                  canEdit={canEdit}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.notifications.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  No notifications yet.
                </p>
              ) : (
                order.notifications.map((notification) => {
                  const Icon =
                    notification.channel === "WHATSAPP"
                      ? MessageCircle
                      : notification.channel === "TELEGRAM"
                        ? Send
                        : Mail;
                  return (
                    <div
                      key={notification.id}
                      className="rounded-lg border border-zinc-200/70 p-2.5 dark:border-zinc-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-50">
                            <Icon className="h-4 w-4 text-zinc-500" />
                            {notification.channel.toLowerCase()}
                          </p>
                          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {notification.recipient}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-zinc-500">
                          {notification.status.toLowerCase()}
                        </span>
                      </div>
                      {notification.attempts > 0 || notification.nextAttemptAt ? (
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {notification.attempts} attempt
                          {notification.attempts === 1 ? "" : "s"}
                          {notification.nextAttemptAt
                            ? ` · retry ${formatDate(notification.nextAttemptAt)}`
                            : ""}
                        </p>
                      ) : null}
                      {notification.errorMessage ? (
                        <p className="mt-2 text-xs text-zinc-800">
                          {notification.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {order.commissions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Referral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.commissions.map((c) => (
                  <div
                    key={c.id}
                    className="space-y-1 rounded-lg border border-zinc-200/70 p-2.5 dark:border-zinc-800"
                  >
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {c.affiliate.customer.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {c.affiliate.customer.email}
                    </p>
                    <div className="flex justify-between pt-1.5 text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Commission ({c.percent}%)
                      </span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {formatPrice(c.amount)}
                      </span>
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-zinc-400">
                      {c.status.toLowerCase()}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function readManualPayment(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const manual = root.manualPayment;
  if (!manual || typeof manual !== "object" || Array.isArray(manual)) return null;
  const raw = manual as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!name) return null;
  return {
    name,
    type: typeof raw.type === "string" ? raw.type : null,
    accountName:
      typeof raw.accountName === "string" ? raw.accountName : null,
    accountNumber:
      typeof raw.accountNumber === "string" ? raw.accountNumber : null,
    qrImageUrl:
      typeof raw.qrImageUrl === "string" ? raw.qrImageUrl : null,
    instructions:
      typeof raw.instructions === "string" ? raw.instructions : null,
  };
}
