import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolveRange } from "@/lib/analytics-range";
import { campaignReport } from "@/lib/campaign-report";
import { getCurrentWorkspace } from "@/lib/workspace";
import { csvCell } from "@/lib/csv";

/** One row per source / medium / campaign, as CSV. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = await getCurrentWorkspace(session.user.id);
  if (!current) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const params = request.nextUrl.searchParams;
  const range = resolveRange({
    range: params.get("range"),
    from: params.get("from"),
    to: params.get("to"),
  });
  const rows = await campaignReport({
    workspaceId: current.workspace.id,
    from: range.from,
    to: range.to,
    limit: 500,
  });

  const csv = [
    [
      "sumber",
      "medium",
      "kampanye",
      "pengunjung",
      "lihat_produk",
      "keranjang",
      "checkout",
      "pembelian",
      "pendapatan",
      "refund",
      "pendapatan_bersih",
    ],
    ...rows.map((row) => [
      row.source,
      row.medium,
      row.campaign,
      row.visitors,
      row.views,
      row.addToCart,
      row.checkouts,
      row.purchases,
      row.revenue,
      row.refunded,
      Math.max(row.revenue - row.refunded, 0),
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kampanye-${range.from
        .toISOString()
        .slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
