import { NextRequest, NextResponse } from "next/server";
import type { Prisma, SaaSInvoiceStatus } from "@prisma/client";

import { requireSuperAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

function cell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  await requireSuperAdmin();
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const rawStatus = request.nextUrl.searchParams.get("status") ?? "";
  const statuses = ["AWAITING_PAYMENT", "AWAITING_VERIFICATION", "PAID", "REJECTED", "EXPIRED", "CANCELLED"];
  const status = statuses.includes(rawStatus) ? rawStatus as SaaSInvoiceStatus : undefined;
  const where: Prisma.SaaSInvoiceWhereInput = { ...(status ? { status } : {}), ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}) };
  const invoices = await prisma.saaSInvoice.findMany({ where, include: { user: { select: { email: true, name: true } }, plan: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10_000 });
  const rows = [["Invoice", "User", "Email", "Plan", "Status", "Amount", "Created", "Paid"], ...invoices.map((invoice) => [invoice.number, invoice.user.name ?? "", invoice.user.email, invoice.plan.name, invoice.status, invoice.totalAmount, invoice.createdAt.toISOString(), invoice.paidAt?.toISOString() ?? ""])];
  const csv = rows.map((row) => row.map(cell).join(",")).join("\n");
  return new NextResponse(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
