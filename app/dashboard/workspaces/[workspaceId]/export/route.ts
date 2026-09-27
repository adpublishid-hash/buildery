import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { workspaceId: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: params.workspaceId, userId: session.user.id } } });
  if (!membership || !canInWorkspace(membership.role, "workspace.edit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const workspace = await prisma.workspace.findUnique({
    where: { id: params.workspaceId },
    include: {
      websites: { include: { pages: { include: { blocks: true } } } },
      savedSections: true,
      products: { include: { variants: true, category: true } },
      courses: { include: { modules: { include: { lessons: true } } } },
      blogPosts: true,
      forms: { include: { fields: true } },
      membershipPlans: true,
      storefrontSetting: true,
      ecommerceSetting: { select: { currencyCode: true, currencyLocale: true, currencySymbol: true, currencySymbolPosition: true, thousandSeparator: true, decimalSeparator: true, decimalPlaces: true, checkoutRequireLogin: true, checkoutAutoCreateAccount: true, checkoutCouponEnabled: true, checkoutSellerNoteEnabled: true, defaultDimensionUnit: true, defaultWeightUnit: true, lowStockThreshold: true, taxEnabled: true, taxRateBps: true, pricesIncludeTax: true } },
      members: { include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const payload = { exportVersion: 1, exportedAt: new Date().toISOString(), privacy: "Credentials, customers, orders, payments, submissions, and analytics are excluded.", workspace };
  return new NextResponse(JSON.stringify(payload, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${workspace.slug}-export.json"`, "cache-control": "private, no-store" } });
}
