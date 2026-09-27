import "server-only";

import { prisma } from "@/lib/prisma";
import type { Cart } from "@/lib/store";

/**
 * The durable copy of a shopper's cart.
 *
 * The cookie stays the working copy — every existing caller reads it, and it is
 * the only thing a guest has. This mirrors it into the database so a signed-in
 * shopper finds the same cart on their laptop, and so a cart abandoned before
 * checkout is something the shop can see at all.
 *
 * Nothing here throws: a cart that fails to persist is a worse shopping
 * experience, not a broken one, and it must never take an add-to-cart with it.
 */

export type CartOwner = { customerId?: string | null; visitorId?: string | null };

/** Merges two carts, taking the larger quantity for anything in both. */
export function mergeCarts(a: Cart, b: Cart): Cart {
  const items = [...a.items];
  for (const item of b.items) {
    const existing = items.find(
      (candidate) =>
        candidate.productId === item.productId &&
        (candidate.variantId ?? null) === (item.variantId ?? null)
    );
    if (existing) {
      existing.quantity = Math.min(Math.max(existing.quantity, item.quantity), 99);
    } else {
      items.push({ ...item });
    }
  }
  return {
    workspaceId: a.workspaceId,
    items,
    // Whichever cart still has a coupon keeps it; the checkout re-validates.
    couponCode: a.couponCode ?? b.couponCode ?? null,
  };
}

export async function persistCart(cart: Cart, owner: CartOwner): Promise<void> {
  const customerId = owner.customerId ?? null;
  const visitorId = owner.visitorId ?? null;
  // Hoisted: narrowing a property does not survive into the closure below.
  const workspaceId = cart.workspaceId;
  // An anonymous cart with no visitor id is unrecoverable, so not worth a row.
  if (!workspaceId || (!customerId && !visitorId)) return;

  try {
    await prisma.$transaction(async (tx) => {
      let cartId: string | null = null;

      if (customerId !== null) {
        const owned = customerId;
        const record = await tx.cart.upsert({
          where: {
            workspaceId_customerId: {
              workspaceId,
              customerId: owned,
            },
          },
          update: {
            couponCode: cart.couponCode,
            ...(visitorId ? { visitorId } : {}),
          },
          create: {
            workspaceId,
            customerId: owned,
            visitorId,
            couponCode: cart.couponCode,
          },
          select: { id: true },
        });
        cartId = record.id;
      } else if (visitorId !== null) {
        const anonymous = visitorId;
        const existing = await tx.cart.findFirst({
          where: {
            workspaceId,
            visitorId: anonymous,
            customerId: null,
          },
          select: { id: true },
          orderBy: { updatedAt: "desc" },
        });
        const record = existing
          ? await tx.cart.update({
              where: { id: existing.id },
              data: { couponCode: cart.couponCode, updatedAt: new Date() },
              select: { id: true },
            })
          : await tx.cart.create({
              data: {
                workspaceId,
                visitorId: anonymous,
                couponCode: cart.couponCode,
              },
              select: { id: true },
            });
        cartId = record.id;
      }
      if (!cartId) return;

      // Replace wholesale: the cookie is the working copy, and reconciling
      // line by line would only invent ways for the two to disagree.
      await tx.cartItem.deleteMany({ where: { cartId } });
      if (cart.items.length > 0) {
        await tx.cartItem.createMany({
          data: cart.items.map((item) => ({
            cartId: cartId!,
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: Math.max(1, Math.min(item.quantity, 99)),
          })),
          skipDuplicates: true,
        });
      }
    });
  } catch {
    // A cart that could not be saved is still in the shopper's cookie.
  }
}

/**
 * The stored cart for a signed-in shopper, or null when there is none.
 *
 * Items whose product has since been unpublished are dropped here rather than
 * handed to a checkout that would reject them.
 */
export async function loadStoredCart(input: {
  workspaceId: string;
  customerId: string;
}): Promise<Cart | null> {
  try {
    const stored = await prisma.cart.findUnique({
      where: {
        workspaceId_customerId: {
          workspaceId: input.workspaceId,
          customerId: input.customerId,
        },
      },
      select: {
        couponCode: true,
        items: {
          select: {
            productId: true,
            variantId: true,
            quantity: true,
            product: { select: { status: true } },
            variant: { select: { isActive: true } },
          },
        },
      },
    });
    if (!stored) return null;

    const items = stored.items
      .filter(
        (item) =>
          item.product.status === "ACTIVE" &&
          (item.variantId === null || item.variant?.isActive === true)
      )
      .map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      }));

    return { workspaceId: input.workspaceId, items, couponCode: stored.couponCode };
  } catch {
    return null;
  }
}

/** Drops a shopper's stored cart, once it has become an order. */
export async function clearStoredCart(input: {
  workspaceId: string;
  customerId?: string | null;
  visitorId?: string | null;
}): Promise<void> {
  if (!input.customerId && !input.visitorId) return;
  try {
    await prisma.cart.deleteMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.customerId
          ? { customerId: input.customerId }
          : { visitorId: input.visitorId, customerId: null }),
      },
    });
  } catch {
    // Leaving a stale cart row behind is harmless; failing checkout is not.
  }
}
