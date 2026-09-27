import { notFound } from "next/navigation";
import { OrderDocument } from "@/components/orders/order-document";
import { prisma } from "@/lib/prisma";
import { verifyPublicAccessToken } from "@/lib/public-access-token";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice", robots: { index: false } };

export default async function PublicInvoicePage({ params, searchParams }: { params: { workspaceSlug: string }; searchParams: { order?: string; access?: string } }) {
  if (!searchParams.order) notFound();
  const order = await prisma.order.findFirst({ where: { orderNumber: searchParams.order, workspace: { slug: params.workspaceSlug } }, include: { workspace: { select: { name: true } }, customer: true, items: true } });
  if (!order || !verifyPublicAccessToken(searchParams.access, "order", order.id)) notFound();
  return <OrderDocument order={order} workspaceName={order.workspace.name} />;
}
