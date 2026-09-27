import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { OrderStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

const STATUSES: OrderStatus[] = ["PENDING", "PAID", "PROCESSING", "COMPLETED", "CANCELLED", "FAILED", "EXPIRED"];
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = await getCurrentWorkspace(session.user.id);
  if (!current) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  const params = request.nextUrl.searchParams;
  const status = STATUSES.includes(params.get("status") as OrderStatus) ? params.get("status") as OrderStatus : null;
  const q = params.get("q")?.trim().slice(0, 100) || "";
  const where: Prisma.OrderWhereInput = { workspaceId: current.workspace.id, ...(status ? { status } : {}), ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { invoiceNumber: { contains: q, mode: "insensitive" } }, { customerEmailSnapshot: { contains: q, mode: "insensitive" } }, { customerNameSnapshot: { contains: q, mode: "insensitive" } }, { customer: { is: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } } }] } : {}) };
  const orders = await prisma.order.findMany({ where, include: { customer: true, payment: true }, orderBy: { createdAt: "desc" }, take: 10_000 });
  const rows = [["order_number","invoice_number","date","customer","email","status","payment_status","shipping_method","subtotal","discount","shipping","tax","total"], ...orders.map((order) => [order.orderNumber, order.invoiceNumber || "", order.createdAt.toISOString(), order.customer?.name || order.customerNameSnapshot || "", order.customer?.email || order.customerEmailSnapshot || "", order.status, order.payment?.status || "", order.shippingMethodName || "", order.subtotal, order.discount, order.shippingCost, order.taxAmount, order.total])];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0,10)}.csv"` } });
}
function csvCell(value: unknown) { const text = String(value ?? ""); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"`; }
