"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { rateLimitByIp } from "@/lib/rate-limit";
import { normalizeEmail, stockTargetKey } from "@/lib/stock-notifications";
import { getMemberSession } from "@/lib/member-auth";
import { auth } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspace";
import { canInWorkspace } from "@/lib/permissions";
import { randomUUID } from "node:crypto";
import { catalogContentType, catalogItemId, DEFAULT_AD_CURRENCY } from "@/lib/ad-catalog";
import { requestAdContext, sendWorkspaceAdEvent } from "@/lib/ad-events";
import type { MetaCustomData } from "@/lib/meta-capi";
import { publicSiteHref } from "@/lib/public-url";
import { effectivePrice } from "@/lib/store";

type Result =
  | { ok: true; active?: boolean; adEventId?: string; adCustomData?: MetaCustomData }
  | { ok: false; error: string };

export async function toggleWishlistAction(workspaceSlug: string, productId: string): Promise<Result> {
  const member = await getMemberSession(workspaceSlug);
  if (!member) return { ok: false, error: "Silakan login untuk menyimpan wishlist." };
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId: member.workspaceId, status: "ACTIVE" },
    select: {
      slug: true,
      name: true,
      price: true,
      discountPrice: true,
      _count: { select: { variants: { where: { isActive: true } } } },
    },
  });
  if (!product) return { ok: false, error: "Product not found." };
  const existing = await prisma.wishlistItem.findUnique({ where: { customerId_productId: { customerId: member.customerId, productId } } });
  if (existing) await prisma.wishlistItem.delete({ where: { id: existing.id } });
  else await prisma.wishlistItem.create({ data: { workspaceId: member.workspaceId, customerId: member.customerId, productId } });
  revalidatePath(`/site/${workspaceSlug}/products/${product.slug}`);
  revalidatePath(`/site/${workspaceSlug}/member/account`);
  if (existing) return { ok: true, active: false };

  // Saving to a wishlist is intent worth retargeting; removing it is not.
  const price = effectivePrice(product);
  const adEventId = `add_to_wishlist:${randomUUID()}`;
  const adCustomData: MetaCustomData = {
    content_ids: [catalogItemId(productId)],
    content_name: product.name,
    content_type: catalogContentType(product._count.variants > 0),
    contents: [{ id: catalogItemId(productId), quantity: 1, item_price: price }],
    currency: DEFAULT_AD_CURRENCY,
    value: price,
  };
  sendWorkspaceAdEvent(member.workspaceId, {
    eventName: "AddToWishlist",
    eventId: adEventId,
    ...requestAdContext(publicSiteHref(workspaceSlug, `products/${product.slug}`)),
    customData: adCustomData,
    customerData: { externalId: member.customerId },
  }).catch((error) => {
    console.warn("Ad event AddToWishlist failed", error);
  });
  return { ok: true, active: true, adEventId, adCustomData };
}

export async function submitProductReviewAction(workspaceSlug: string, productId: string, orderItemId: string, formData: FormData): Promise<Result> {
  const member = await getMemberSession(workspaceSlug);
  if (!member) return { ok: false, error: "Silakan login untuk memberi ulasan." };
  const rating = Math.floor(Number(formData.get("rating")));
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const body = String(formData.get("body") ?? "").trim().slice(0, 3000);
  if (rating < 1 || rating > 5) return { ok: false, error: "Rating harus 1 sampai 5." };
  const item = await prisma.orderItem.findFirst({
    where: { id: orderItemId, productId, order: { customerId: member.customerId, workspaceId: member.workspaceId, status: { in: ["PAID", "PROCESSING", "COMPLETED"] } } },
    select: { id: true },
  });
  if (!item) return { ok: false, error: "Hanya pembeli terverifikasi yang dapat memberi ulasan." };
  await prisma.productReview.upsert({
    where: { orderItemId },
    update: { rating, title: title || null, body: body || null, customerName: member.name, status: "PENDING" },
    create: { workspaceId: member.workspaceId, productId, customerId: member.customerId, orderItemId, rating, title: title || null, body: body || null, customerName: member.name },
  });
  revalidatePath(`/site/${workspaceSlug}/products`);
  return { ok: true };
}

export async function moderateProductReviewAction(reviewId: string, status: "PUBLISHED" | "REJECTED"): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return { ok: false, error: "Not allowed." };
  const review = await prisma.productReview.findFirst({ where: { id: reviewId, workspaceId: current.workspace.id }, include: { product: { select: { slug: true } } } });
  if (!review) return { ok: false, error: "Review not found." };
  await prisma.productReview.update({ where: { id: reviewId }, data: { status } });
  revalidatePath(`/dashboard/products/${review.productId}/edit`);
  revalidatePath(`/site/${current.workspace.slug}/products/${review.product.slug}`);
  return { ok: true };
}

/**
 * Signs a shopper up to hear when a sold-out product returns.
 *
 * Open to guests: the point is to catch the person who was about to leave, and
 * asking them to make an account first defeats it.
 */
export async function watchStockAction(
  workspaceSlug: string,
  productId: string,
  formData: FormData
): Promise<Result> {
  const throttle = await rateLimitByIp("stock-watch", 10, 10 * 60 * 1000);
  if (!throttle.ok) {
    return { ok: false, error: "Terlalu banyak permintaan. Coba lagi nanti." };
  }

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Masukkan alamat email yang valid." };
  }

  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "ACTIVE" },
    select: { id: true },
  });
  if (!workspace) return { ok: false, error: "Toko tidak ditemukan." };

  const rawVariantId = String(formData.get("variantId") ?? "").trim() || null;
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId: workspace.id, status: "ACTIVE" },
    select: { id: true, variants: { select: { id: true } } },
  });
  if (!product) return { ok: false, error: "Produk tidak tersedia." };

  const variantId =
    rawVariantId && product.variants.some((variant) => variant.id === rawVariantId)
      ? rawVariantId
      : null;

  await prisma.stockNotification.upsert({
    where: {
      workspaceId_targetKey_email: {
        workspaceId: workspace.id,
        targetKey: stockTargetKey(product.id, variantId),
        email,
      },
    },
    // Asking again after being told resets the watch, rather than doing nothing.
    update: { notifiedAt: null },
    create: {
      workspaceId: workspace.id,
      productId: product.id,
      variantId,
      targetKey: stockTargetKey(product.id, variantId),
      email,
    },
  });

  return { ok: true };
}
