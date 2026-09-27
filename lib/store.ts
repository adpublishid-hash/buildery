import "server-only";

import { cookies } from "next/headers";
import type { Coupon, Product } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { bundleStock } from "@/lib/bundle-queries";
import { formatPrice } from "@/lib/utils";
import { effectiveVariantPrice } from "@/lib/product-variants";

export const CART_COOKIE = "bd_cart";

export type CartItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};
export type Cart = {
  workspaceId: string | null;
  items: CartItem[];
  couponCode: string | null;
};

const EMPTY_CART: Cart = { workspaceId: null, items: [], couponCode: null };

/** Reads and sanitises the cart cookie. Never throws. */
export function readCart(): Cart {
  const raw = cookies().get(CART_COOKIE)?.value;
  if (!raw) return EMPTY_CART;
  try {
    const parsed = JSON.parse(raw) as Partial<Cart>;
    if (!parsed || !Array.isArray(parsed.items)) return EMPTY_CART;
    const items: CartItem[] = parsed.items
      .filter(
        (it): it is CartItem =>
          !!it &&
          typeof it.productId === "string" &&
          (it.variantId == null || typeof it.variantId === "string") &&
          typeof it.quantity === "number" &&
          it.quantity > 0
      )
      .map((it) => ({
        productId: it.productId,
        variantId: typeof it.variantId === "string" ? it.variantId : null,
        quantity: Math.min(Math.floor(it.quantity), 99),
      }));
    return {
      workspaceId:
        typeof parsed.workspaceId === "string" ? parsed.workspaceId : null,
      items,
      couponCode:
        typeof parsed.couponCode === "string" && parsed.couponCode
          ? parsed.couponCode
          : null,
    };
  } catch {
    return EMPTY_CART;
  }
}

/** Total item count for a cart (for badge display). */
export function cartCount(cart: Cart) {
  return cart.items.reduce((sum, it) => sum + it.quantity, 0);
}

/** The price a customer actually pays — discount price when it's lower. */
export function effectivePrice(
  product: Pick<Product, "price" | "discountPrice">
) {
  if (
    product.discountPrice != null &&
    product.discountPrice > 0 &&
    product.discountPrice < product.price
  ) {
    return product.discountPrice;
  }
  return product.price;
}

export function hasDiscount(
  product: Pick<Product, "price" | "discountPrice">
) {
  return effectivePrice(product) < product.price;
}

export function effectiveProductVariantPrice(
  product: Pick<Product, "price" | "discountPrice">,
  variant: { price: number | null; discountPrice?: number | null }
) {
  const base = variant.price == null ? effectivePrice(product) : variant.price;
  return effectiveVariantPrice(base, variant);
}

// Re-export so existing server callers keep importing from "@/lib/store".
export { formatPrice };

/** Human-friendly order number, e.g. ORD-LK4F9A2. */
export function generateOrderNumber(prefix = "ORD") {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
  const safePrefix =
    prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "ORD";
  return `${safePrefix}-${stamp}${rand}`;
}

/** Looks up a workspace by slug for the public store routes. */
export function getStoreWorkspace(slug: string) {
  return prisma.workspace.findFirst({ where: { slug, status: "ACTIVE" } });
}

export type CouponValidation =
  | { ok: true; coupon: Coupon; discount: number; freeShipping: boolean }
  | { ok: false; reason: string };

/**
 * Validates a coupon against a subtotal: workspace match, active, not
 * expired, not over-used. Computes the discount in rupiah.
 */
export async function evaluateCoupon(
  workspaceId: string,
  code: string,
  subtotal: number,
  context?: {
    customerEmail?: string;
    lines?: { productId: string; quantity: number; unitPrice: number }[];
  }
): Promise<CouponValidation> {
  if (!code) return { ok: false, reason: "Enter a coupon code." };

  const coupon = await prisma.coupon.findUnique({
    where: { workspaceId_code: { workspaceId, code: code.toUpperCase() } },
  });
  if (!coupon) return { ok: false, reason: "Coupon not found." };
  if (!coupon.isActive)
    return { ok: false, reason: "This coupon is inactive." };
  if (coupon.startsAt && coupon.startsAt.getTime() > Date.now())
    return { ok: false, reason: "This coupon is not active yet." };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now())
    return { ok: false, reason: "This coupon has expired." };
  if (coupon.maxUses != null && coupon.uses >= coupon.maxUses)
    return { ok: false, reason: "This coupon has reached its usage limit." };
  if (subtotal < coupon.minimumPurchase)
    return {
      ok: false,
      reason: `Minimum purchase for this coupon is ${formatPrice(coupon.minimumPurchase)}.`,
    };
  let customer: { id: string } | null = null;
  if (context?.customerEmail) {
    customer = await prisma.customer.findUnique({
      where: {
        workspaceId_email: {
          workspaceId,
          email: context.customerEmail.toLowerCase(),
        },
      },
      select: { id: true },
    });
    if (coupon.customerId && customer?.id !== coupon.customerId) {
      return { ok: false, reason: "This coupon is for another customer." };
    }
  }
  if (coupon.firstOrderOnly && customer) {
    const previousOrders = await prisma.order.count({
      where: {
        workspaceId,
        customerId: customer.id,
        status: { in: ["PAID", "PROCESSING", "COMPLETED"] },
      },
    });
    if (previousOrders > 0) {
      return { ok: false, reason: "This coupon is only valid for a first order." };
    }
  }
  if (coupon.maxUsesPerCustomer && customer) {
    const customerUses = await prisma.order.count({
      where: {
        workspaceId,
        customerId: customer.id,
        couponId: coupon.id,
        status: { in: ["PAID", "PROCESSING", "COMPLETED"] },
      },
    });
    if (customerUses >= coupon.maxUsesPerCustomer) {
      return { ok: false, reason: "You have reached this coupon's usage limit." };
    }
  }

  const eligibleSubtotal =
    coupon.productIds.length > 0 && context?.lines
      ? context.lines
          .filter((line) => coupon.productIds.includes(line.productId))
          .reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
      : subtotal;
  if (eligibleSubtotal <= 0) {
    return { ok: false, reason: "This coupon does not apply to these products." };
  }

  const raw =
    coupon.type === "PERCENTAGE"
      ? Math.floor((eligibleSubtotal * coupon.value) / 100)
      : coupon.value;
  const discount = Math.min(Math.max(raw, 0), eligibleSubtotal);
  return { ok: true, coupon, discount, freeShipping: coupon.freeShipping };
}

/**
 * Loads the cart's products and merges them with quantities into priced
 * line items. Drops items whose product is gone or no longer active.
 */
export async function getCartDetail(workspaceSlug: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "ACTIVE" },
    include: { ecommerceSetting: true },
  });
  if (!workspace) {
    return {
      workspace: null,
      lines: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      coupon: null,
      couponError: null,
    };
  }

  const cart = readCart();
  if (cart.workspaceId !== workspace.id || cart.items.length === 0) {
    return {
      workspace,
      lines: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      coupon: null,
      couponError: null,
    };
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: cart.items.map((it) => it.productId) },
      workspaceId: workspace.id,
      status: "ACTIVE",
    },
    include: { image: true, variants: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  // A bundle has no stock of its own; ask what its contents allow.
  const bundleStockById = await bundleStock(
    products.filter((p) => p.type === "BUNDLE").map((p) => p.id)
  );

  const lines = cart.items
    .map((it) => {
      const product = byId.get(it.productId);
      if (!product) return null;
      const variant = it.variantId
        ? product.variants.find(
            (candidate) => candidate.id === it.variantId && candidate.isActive
          )
        : null;
      if (it.variantId && !variant) return null;
      const unitPrice = variant
        ? effectiveProductVariantPrice(product, variant)
        : effectivePrice(product);
      const available =
        product.type === "BUNDLE"
          ? (bundleStockById.get(product.id) ?? 0)
          : (variant?.stock ?? product.stock);
      const quantity =
        product.type === "PHYSICAL" || product.type === "BUNDLE"
          ? Math.min(it.quantity, Math.max(available, 0))
          : it.quantity;
      return { product, variant, quantity, unitPrice, lineTotal: unitPrice * quantity };
    })
    .filter(
      (l): l is NonNullable<typeof l> => l !== null && l.quantity > 0
    );

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  let discount = 0;
  let coupon: Coupon | null = null;
  let couponError: string | null = null;
  if (cart.couponCode && workspace.ecommerceSetting?.checkoutCouponEnabled !== false) {
    const result = await evaluateCoupon(
      workspace.id,
      cart.couponCode,
      subtotal,
      {
        lines: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      }
    );
    if (result.ok) {
      coupon = result.coupon;
      discount = result.discount;
    } else {
      couponError = result.reason;
    }
  }

  return {
    workspace,
    lines,
    subtotal,
    discount,
    total: Math.max(subtotal - discount, 0),
    coupon,
    couponError,
  };
}
