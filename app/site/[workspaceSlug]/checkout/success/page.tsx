import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, Clock3, FileText, Mail, MessageCircle, RotateCcw, Send, Truck, Wallet } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import type { MetaCustomData } from "@/lib/meta-capi";
import { catalogItemId } from "@/lib/ad-catalog";
import { getWorkspaceAdCurrency } from "@/lib/ad-events";
import { buildPixelIdentity, isSafePixelIdentity } from "@/lib/ad-identity";
import { formatPrice, getStoreWorkspace } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { FulfillmentStatusBadge } from "@/components/orders/fulfillment-status-badge";
import { RefundStatusBadge } from "@/components/orders/refund-status-badge";
import { StoreHeader } from "@/components/store/store-header";
import { MetaEventTracker } from "@/components/site/meta-event-tracker";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { ManualPaymentProofForm } from "@/components/store/manual-payment-proof-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Order confirmed" },
  robots: { index: false },
};

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams: { order?: string; access?: string };
}) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();

  const orderNumber = searchParams.order;
  const order = orderNumber
    ? await prisma.order.findUnique({
        where: {
          workspaceId_orderNumber: {
            workspaceId: workspace.id,
            orderNumber,
          },
        },
        include: {
          customer: true,
          items: true,
          payment: true,
          refunds: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          notifications: { orderBy: { createdAt: "desc" } },
        },
      })
    : null;
  if (!order) notFound();
  if (!verifyPublicAccessToken(searchParams.access, "order", order.id)) {
    notFound();
  }
  const manualPayment = readManualPayment(order.payment?.rawNotification);
  const customerNotifications = order.notifications.filter(
    (notification) =>
      !order.customerId || notification.customerId === order.customerId
  );
  const itemAdId = (item: { id: string; productId: string | null; variantId: string | null }) =>
    item.productId ? catalogItemId(item.productId, item.variantId) : item.id;
  const purchaseMetaData: MetaCustomData = {
    content_ids: order.items.map(itemAdId),
    content_name: `Order ${order.orderNumber}`,
    content_type: "product",
    contents: order.items.map((item) => ({
      id: itemAdId(item),
      quantity: item.quantity,
      item_price: item.unitPrice,
    })),
    currency: await getWorkspaceAdCurrency(workspace.id),
    value: order.total,
    num_items: order.items.reduce((sum, item) => sum + item.quantity, 0),
    order_id: order.orderNumber,
  };
  // A guest buyer is not signed in, so the layout had no identity to give the
  // pixels; the order does. Hashed here, never sent raw.
  const buyerIdentity = buildPixelIdentity({
    email: order.customer?.email ?? order.customerEmailSnapshot,
    phone: order.customer?.phone ?? order.customerPhoneSnapshot,
    externalId: order.customerId,
  });
  const purchaseIdentity = isSafePixelIdentity(buyerIdentity)
    ? { tiktok: buyerIdentity.tiktok, google: buyerIdentity.google }
    : undefined;
  const canRequestReturn = ["PAID", "PROCESSING", "COMPLETED"].includes(order.status);

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />
      {order.status === "PAID" ? (
        <MetaEventTracker
          workspaceId={workspace.id}
          eventName="Purchase"
          eventId={`purchase:order:${order.orderNumber}`}
          dedupeKey={`purchase:order:${order.orderNumber}`}
          customData={purchaseMetaData}
          sendServer={false}
          identity={purchaseIdentity}
        />
      ) : null}

      <main className="mx-auto max-w-md px-6 py-14 text-center">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
          order.status === "PAID" ? "bg-emerald-100" : "bg-amber-100"
        }`}>
          {order.status === "PAID" ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          ) : (
            <Clock3 className="h-6 w-6 text-amber-600" />
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {order.status === "PAID" ? "Pembayaran berhasil" : "Pesanan diterima"}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Order <span className="font-medium">{order.orderNumber}</span>{" "}
          {order.status === "PAID"
            ? "sudah dibayar."
            : "menunggu konfirmasi pembayaran."}
        </p>

        <div className="mt-6 rounded-xl border border-zinc-200 p-4 text-left">
          <ul className="space-y-2">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex justify-between gap-3 text-sm"
              >
                <span className="text-zinc-600">
                  {item.nameSnapshot}
                  <span className="text-zinc-400"> × {item.quantity}</span>
                </span>
                <span className="shrink-0 font-medium text-zinc-900">
                  {formatPrice(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          {order.shippingCost > 0 || order.discount > 0 || order.taxAmount > 0 ? (
            <div className="mt-3 space-y-1 border-t border-zinc-200/70 pt-3 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              {order.discount > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <span>Diskon</span>
                  <span>− {formatPrice(order.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-zinc-600">
                <span>
                  {order.shippingMethodName || "Ongkir"}{" "}
                  {order.shippingCourier ? (
                    <span className="text-xs text-zinc-400">
                      ({order.shippingCourier.toUpperCase()}
                      {order.shippingService ? ` ${order.shippingService}` : ""})
                    </span>
                  ) : null}
                </span>
                <span>{formatPrice(order.shippingCost)}</span>
              </div>
              {order.taxAmount > 0 ? (
                <div className="flex justify-between text-zinc-600"><span>Pajak</span><span>{formatPrice(order.taxAmount)}</span></div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex justify-between border-t border-zinc-200/70 pt-3 text-sm">
            <span className="font-medium text-zinc-900">
              {order.status === "PAID" ? "Total paid" : "Total tagihan"}
            </span>
            <span className="font-semibold text-zinc-900">
              {formatPrice(order.total)}
            </span>
          </div>
        </div>

        {order.shippingAddress ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 text-left text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Alamat pengiriman
            </p>
            <p className="mt-2 font-medium text-zinc-900">
              {order.shippingRecipientName}
            </p>
            {order.shippingRecipientPhone ? (
              <p className="text-xs text-zinc-500">{order.shippingRecipientPhone}</p>
            ) : null}
            <p className="mt-2 whitespace-pre-line text-zinc-600">
              {order.shippingAddress}
            </p>
            <p className="mt-1 text-zinc-600">
              {[order.shippingCityName, order.shippingProvinceName, order.shippingPostalCode]
                .filter(Boolean)
                .join(", ")}
            </p>
            {order.shippingCourier ? (
              <p className="mt-2 text-xs text-zinc-500">
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
          </div>
        ) : null}

        {order.fulfillmentStatus !== "NOT_REQUIRED" ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 text-left text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-medium text-zinc-900">
                <Truck className="h-4 w-4 text-zinc-500" />
                Fulfillment
              </p>
              <FulfillmentStatusBadge status={order.fulfillmentStatus} />
            </div>
            {order.fulfillmentTrackingNumber || order.fulfillmentTrackingCarrier ? (
              <p className="mt-3 text-zinc-600">
                {[order.fulfillmentTrackingCarrier, order.fulfillmentTrackingNumber]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            {order.fulfillmentTrackingUrl ? (
              <a
                href={order.fulfillmentTrackingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-zinc-900 underline"
              >
                Cek resi
              </a>
            ) : null}
          </div>
        ) : null}

        {order.refunds.length > 0 ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 text-left text-sm">
            <p className="font-medium text-zinc-900">Refund & return</p>
            <div className="mt-3 space-y-2">
              {order.refunds.map((refund) => (
                <div
                  key={refund.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">
                      {formatPrice(refund.amount)}
                    </p>
                    <p className="text-xs uppercase text-zinc-500">
                      {refund.type.toLowerCase()}
                    </p>
                  </div>
                  <RefundStatusBadge status={refund.status} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {order.payment?.provider.startsWith("manual:") ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  Transfer manual dipilih
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Silakan transfer sesuai metode{" "}
                  <span className="font-medium">
                    {manualPayment?.name ?? order.payment.provider.replace("manual:", "")}
                  </span>
                  . Admin akan memverifikasi pembayaran dari dashboard.
                </p>
                {manualPayment ? (
                  <div className="mt-3 space-y-2 rounded-lg bg-white/70 p-3 text-sm text-amber-950">
                    {manualPayment.type === "QRIS" && manualPayment.qrImageUrl ? (
                      <div className="flex flex-col items-center gap-2 py-2">
                        <p className="text-xs text-amber-700">Scan QRIS untuk membayar</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={manualPayment.qrImageUrl}
                          alt="QRIS"
                          className="h-56 w-56 rounded-md bg-white object-contain p-2"
                        />
                      </div>
                    ) : null}
                    {manualPayment.accountName ? (
                      <p>
                        <span className="text-amber-700">Atas nama:</span>{" "}
                        <span className="font-medium">
                          {manualPayment.accountName}
                        </span>
                      </p>
                    ) : null}
                    {manualPayment.accountNumber ? (
                      <p>
                        <span className="text-amber-700">Nomor:</span>{" "}
                        <span className="font-mono font-semibold">
                          {manualPayment.accountNumber}
                        </span>
                      </p>
                    ) : null}
                    {manualPayment.instructions ? (
                      <p className="pt-1 leading-5">
                        {manualPayment.instructions}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {order.payment.status === "PENDING" ? (
                  <ManualPaymentProofForm
                    orderId={order.id}
                    accessToken={searchParams.access ?? ""}
                    initialStatus={order.payment.manualProofStatus}
                  />
                ) : order.payment.manualProofStatus === "VERIFIED" ? (
                  <div className="mt-4 border-t border-amber-200 pt-4">
                    <ManualPaymentProofForm
                      orderId={order.id}
                      accessToken={searchParams.access ?? ""}
                      initialStatus="VERIFIED"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-zinc-200 p-4 text-left">
          <p className="text-sm font-semibold text-zinc-900">
            Notifikasi terkirim
          </p>
          <div className="mt-3 space-y-2">
            {customerNotifications.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Notifikasi sedang disiapkan.
              </p>
            ) : (
              customerNotifications.map((notification) => {
                const Icon =
                  notification.channel === "WHATSAPP"
                    ? MessageCircle
                    : notification.channel === "TELEGRAM"
                      ? Send
                      : Mail;
                return (
                  <div
                    key={notification.id}
                    className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 text-zinc-500" />
                      {notification.channel.toLowerCase()} ke{" "}
                      {notification.recipient}
                    </span>
                    <span className="text-xs font-medium text-zinc-500">
                      {notification.status.toLowerCase()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="outline">
            <Link href={`${publicSiteContextHref(workspace.slug, "checkout/invoice")}?order=${encodeURIComponent(order.orderNumber)}&access=${encodeURIComponent(searchParams.access ?? "")}`} target="_blank">
              <FileText className="h-4 w-4" /> Invoice
            </Link>
          </Button>
          {canRequestReturn ? (
            <Button asChild variant="outline">
              <Link
                href={`${publicSiteContextHref(
                  workspace.slug,
                  "checkout/return"
                )}?order=${encodeURIComponent(order.orderNumber)}&access=${encodeURIComponent(
                  searchParams.access ?? ""
                )}`}
              >
                <RotateCcw className="h-4 w-4" />
                Request refund / return
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href={publicSiteContextHref(workspace.slug, "products")}>
              Continue shopping
            </Link>
          </Button>
        </div>
      </main>
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
