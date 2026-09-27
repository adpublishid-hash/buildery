import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { FulfillmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FULFILLMENT_STATUSES, updateOrderFulfillment } from "@/lib/order-fulfillment";
import { rateLimitByIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limit = await rateLimitByIp("shipping-webhook", 180, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  const secret = process.env.SHIPPING_WEBHOOK_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !safeEqual(provided, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderNumber = typeof body?.orderNumber === "string" ? body.orderNumber : "";
  const workspaceSlug = typeof body?.workspaceSlug === "string" ? body.workspaceSlug : "";
  const status = typeof body?.status === "string" ? body.status.toUpperCase() as FulfillmentStatus : "" as FulfillmentStatus;
  if (!orderNumber || !workspaceSlug || !FULFILLMENT_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const order = await prisma.order.findFirst({ where: { orderNumber, workspace: { slug: workspaceSlug } }, select: { id: true, workspaceId: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const result = await updateOrderFulfillment(order.id, { workspaceId: order.workspaceId, status, trackingCarrier: text(body?.carrier), trackingNumber: text(body?.trackingNumber), trackingUrl: text(body?.trackingUrl), note: text(body?.note) || "Updated by shipping webhook" });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
function text(value: unknown) { return typeof value === "string" ? value : null; }
function safeEqual(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
