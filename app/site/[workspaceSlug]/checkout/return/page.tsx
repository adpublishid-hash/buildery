import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { RefundStatus } from "@prisma/client";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import { formatPrice, getStoreWorkspace } from "@/lib/store";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { Button } from "@/components/ui/button";
import { StoreHeader } from "@/components/store/store-header";
import { ReturnRequestForm } from "@/components/store/return-request-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Return request" },
  robots: { index: false },
};

const ACTIVE_REFUND_STATUSES = new Set<RefundStatus>([
  "REQUESTED",
  "APPROVED",
  "REFUNDED",
]);

export default async function CheckoutReturnPage({
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
          items: {
            include: {
              product: { select: { type: true } },
              refundItems: {
                select: {
                  quantity: true,
                  restockQuantity: true,
                  refund: { select: { status: true } },
                },
              },
            },
          },
          refunds: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      })
    : null;
  if (!order) notFound();
  if (!verifyPublicAccessToken(searchParams.access, "order", order.id)) {
    notFound();
  }

  const canRequest = ["PAID", "PROCESSING", "COMPLETED"].includes(order.status);
  const items = order.items.map((item) => {
    const activeRefunds = item.refundItems.filter((refundItem) =>
      ACTIVE_REFUND_STATUSES.has(refundItem.refund.status)
    );
    const refundedQuantity = activeRefunds.reduce(
      (sum, refundItem) => sum + Math.max(0, refundItem.quantity),
      0
    );
    const restockedQuantity = activeRefunds.reduce(
      (sum, refundItem) => sum + Math.max(0, refundItem.restockQuantity),
      0
    );
    const refundableQuantity = Math.max(0, item.quantity - refundedQuantity);
    const restockableQuantity = Math.max(0, item.quantity - restockedQuantity);
    return {
      id: item.id,
      name: item.nameSnapshot,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      refundableQuantity,
      restockableQuantity,
      isPhysical: item.product?.type === "PHYSICAL",
    };
  });
  const activeItems = items.filter((item) => item.refundableQuantity > 0);
  const activeRefundAmount = order.refunds
    .filter((refund) => ACTIVE_REFUND_STATUSES.has(refund.status))
    .reduce((sum, refund) => sum + Math.max(0, refund.amount), 0);
  const refundableAmount = Math.max(0, order.total - activeRefundAmount);

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />

      <main className="mx-auto max-w-2xl px-6 py-12">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link
            href={`${publicSiteContextHref(
              workspace.slug,
              "checkout/success"
            )}?order=${encodeURIComponent(order.orderNumber)}&access=${encodeURIComponent(
              searchParams.access ?? ""
            )}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Link>
        </Button>

        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
            <RotateCcw className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Request refund / return
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Order {order.orderNumber} · total {formatPrice(order.total)}
            </p>
          </div>
        </div>

        {!canRequest ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Request bisa dibuat setelah pembayaran order terkonfirmasi.
          </div>
        ) : activeItems.length === 0 || refundableAmount <= 0 ? (
          <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-600">
            Semua item atau nominal order ini sudah tercakup oleh request refund/return.
          </div>
        ) : (
          <ReturnRequestForm
            workspaceSlug={workspace.slug}
            orderNumber={order.orderNumber}
            orderId={order.id}
            accessToken={searchParams.access}
            orderTotal={refundableAmount}
            items={activeItems}
          />
        )}
      </main>
    </div>
  );
}
