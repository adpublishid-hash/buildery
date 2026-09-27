import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitByIp } from "@/lib/rate-limit";
import { effectivePrice } from "@/lib/store";

export async function GET(request: NextRequest, { params }: { params: { workspaceSlug: string } }) {
  const limit = await rateLimitByIp("recent-products", 120, 60_000);
  if (!limit.ok) return NextResponse.json({ products: [] }, { status: 429 });
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") || "").split(",").filter(Boolean))].slice(0, 8);
  if (ids.length === 0) return NextResponse.json({ products: [] });
  const products = await prisma.product.findMany({ where: { id: { in: ids }, status: "ACTIVE", workspace: { slug: params.workspaceSlug } }, include: { image: true } });
  const byId = new Map(products.map((product) => [product.id, product]));
  return NextResponse.json({ products: ids.map((id) => byId.get(id)).filter(Boolean).map((product) => ({ id: product!.id, slug: product!.slug, name: product!.name, price: effectivePrice(product!), imageUrl: product!.image?.url ?? null })) });
}
