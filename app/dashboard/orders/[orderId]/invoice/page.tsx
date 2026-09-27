import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { OrderDocument } from "@/components/orders/order-document";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: { orderId: string }; searchParams: { mode?: string } }) {
  const { workspace } = await requireCurrentWorkspace();
  const order = await prisma.order.findUnique({ where: { id: params.orderId }, include: { customer: true, items: true } });
  if (!order || order.workspaceId !== workspace.id) notFound();
  return <OrderDocument order={order} workspaceName={workspace.name} mode={searchParams.mode === "packing" ? "packing" : "invoice"} />;
}
