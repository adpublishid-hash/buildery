import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "affiliate.view")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const commissions = await prisma.commission.findMany({
    where: { workspaceId: current.workspace.id },
    include: { affiliate: { include: { customer: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const rows = [
    ["created_at", "affiliate", "email", "source", "basis", "rate_percent", "amount", "status", "available_at", "paid_at"],
    ...commissions.map((item) => [
      item.createdAt.toISOString(), item.affiliate.customer.name, item.affiliate.customer.email,
      item.sourceLabel ?? item.sourceKey ?? item.orderId ?? "", item.basisAmount,
      (item.rateBps || item.percent * 100) / 100, item.amount, item.status,
      item.availableAt?.toISOString() ?? "", item.paidAt?.toISOString() ?? "",
    ]),
  ];
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="affiliate-commissions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
