"use server";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { persistCart } from "@/lib/cart-store";
import { VISITOR_COOKIE } from "@/lib/analytics-visitor";
import { getMemberSession } from "@/lib/member-auth";
import { recordConversionEvent } from "@/lib/analytics";
import { requestAdContext, sendWorkspaceAdEvent } from "@/lib/ad-events";
import { publicSiteHref } from "@/lib/public-url";
import { catalogItemId, DEFAULT_AD_CURRENCY } from "@/lib/ad-catalog";
import type { MetaCustomData } from "@/lib/meta-capi";
import {
  CART_COOKIE,
  effectivePrice,
  effectiveProductVariantPrice,
  evaluateCoupon,
  readCart,
  type Cart,
} from "@/lib/store";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

/**
 * Writes the cart to the cookie and mirrors it to the database.
 *
 * The cookie stays the working copy — it is all a guest has, and every reader
 * already uses it. The stored copy is what survives a change of device, and
 * what makes a cart abandoned before checkout visible at all.
 */
async function saveCart(cart: Cart) {
  cookies().set(CART_COOKIE, JSON.stringify(cart), COOKIE_OPTS);
  if (!cart.workspaceId) return;

  const jar = cookies();
  const member = await getCartMember(cart.workspaceId);
  await persistCart(cart, {
    customerId: member?.customerId ?? null,
    visitorId: jar.get(VISITOR_COOKIE)?.value ?? null,
  });
}

/** The signed-in shopper for this storefront, if there is one. */
async function getCartMember(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (!workspace) return null;
  return getMemberSession(workspace.slug);
}

type CartResult = { ok: true } | { ok: false; error: string };
/** `adEventId` is the id the browser pixels must reuse to deduplicate. */
type AddToCartResult =
  | { ok: true; adEventId: string; adCustomData: MetaCustomData }
  | { ok: false; error: string };

export async function addToCartAction(
  workspaceId: string,
  productId: string,
  quantity = 1,
  variantId?: string | null
): Promise<AddToCartResult> {
  const qty = Math.max(1, Math.min(Math.floor(quantity), 99));

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      slug: true,
      workspaceId: true,
      workspace: { select: { slug: true } },
      status: true,
      type: true,
      // Prices are selected so the funnel event can carry a cart value; the
      // cart cookie itself still stores only ids and quantities.
      price: true,
      discountPrice: true,
      variants: {
        where: { isActive: true },
        select: { id: true, stock: true, price: true, discountPrice: true },
      },
    },
  });
  if (
    !product ||
    product.workspaceId !== workspaceId ||
    product.status !== "ACTIVE"
  ) {
    return { ok: false, error: "This product is not available." };
  }
  const variant = variantId
    ? product.variants.find((candidate) => candidate.id === variantId)
    : null;
  if (product.variants.length > 0 && !variant) {
    return { ok: false, error: "Pilih varian produk yang tersedia." };
  }
  if (product.type === "PHYSICAL" && variant && variant.stock < qty) {
    return { ok: false, error: "Stok varian tidak mencukupi." };
  }

  let cart = readCart();
  // Carts are scoped to one workspace — switching stores starts fresh.
  if (cart.workspaceId !== workspaceId) {
    cart = { workspaceId, items: [], couponCode: null };
  }

  const existing = cart.items.find(
    (it) => it.productId === productId && it.variantId === (variant?.id ?? null)
  );
  if (existing) {
    existing.quantity = Math.min(existing.quantity + qty, 99);
  } else {
    cart.items.push({ productId, variantId: variant?.id ?? null, quantity: qty });
  }

  await saveCart(cart);

  // Recorded server-side: an ad blocker can stop the browser pixel, but the
  // funnel must not lose a step because of one.
  const unitPrice = variant ? effectiveProductVariantPrice(product, variant) : effectivePrice(product);
  await recordConversionEvent({
    workspaceId,
    type: "ADD_TO_CART",
    productId,
    value: unitPrice * qty,
  });

  // The server copy of AddToCart. The browser pixels send theirs with the
  // same id. It used to be posted from the browser to /api/meta/event with no
  // signed token, which that endpoint rejects, so it never reached Meta.
  const adEventId = `add_to_cart:${randomUUID()}`;
  const itemId = catalogItemId(product.id, variant?.id);
  // The browser pixels reuse exactly this, so both copies name the same
  // catalog item (the variant, when one was chosen).
  const adCustomData: MetaCustomData = {
    content_ids: [itemId],
    content_name: product.name,
    content_type: "product",
    contents: [{ id: itemId, quantity: qty, item_price: unitPrice }],
    currency: DEFAULT_AD_CURRENCY,
    value: unitPrice * qty,
    num_items: qty,
  };
  sendWorkspaceAdEvent(workspaceId, {
    eventName: "AddToCart",
    eventId: adEventId,
    ...requestAdContext(
      publicSiteHref(product.workspace.slug, `products/${product.slug}`)
    ),
    customData: adCustomData,
  }).catch((error) => {
    console.warn("Ad event AddToCart failed", error);
  });

  revalidatePath("/site", "layout");
  return { ok: true, adEventId, adCustomData };
}

export async function updateCartItemAction(
  productId: string,
  quantity: number,
  variantId?: string | null
): Promise<CartResult> {
  const cart = readCart();
  const qty = Math.floor(quantity);

  if (qty <= 0) {
    cart.items = cart.items.filter(
      (it) => !(it.productId === productId && it.variantId === (variantId ?? null))
    );
  } else {
    const item = cart.items.find(
      (it) => it.productId === productId && it.variantId === (variantId ?? null)
    );
    if (item) item.quantity = Math.min(qty, 99);
  }

  await saveCart(cart);
  revalidatePath("/site", "layout");
  return { ok: true };
}

export async function removeCartItemAction(
  productId: string,
  variantId?: string | null
): Promise<CartResult> {
  const cart = readCart();
  cart.items = cart.items.filter(
    (it) => !(it.productId === productId && it.variantId === (variantId ?? null))
  );
  await saveCart(cart);
  revalidatePath("/site", "layout");
  return { ok: true };
}

export async function clearCartAction(): Promise<CartResult> {
  cookies().delete(CART_COOKIE);
  revalidatePath("/site", "layout");
  return { ok: true };
}

export async function applyCouponAction(
  rawCode: string
): Promise<CartResult> {
  const cart = readCart();
  if (!cart.workspaceId || cart.items.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a coupon code." };

  // Compute the current subtotal for validation.
  const products = await prisma.product.findMany({
    where: {
      id: { in: cart.items.map((i) => i.productId) },
      workspaceId: cart.workspaceId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      price: true,
      discountPrice: true,
      type: true,
      stock: true,
      variants: { where: { isActive: true }, select: { id: true, price: true, discountPrice: true, stock: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const subtotal = cart.items.reduce((sum, it) => {
    const p = byId.get(it.productId);
    if (!p) return sum;
    const variant = it.variantId ? p.variants.find((v) => v.id === it.variantId) : null;
    const unit = variant ? effectiveProductVariantPrice(p, variant) : effectivePrice(p);
    const qty =
      p.type === "PHYSICAL"
        ? Math.min(it.quantity, Math.max(variant?.stock ?? p.stock, 0))
        : it.quantity;
    return sum + unit * qty;
  }, 0);

  const result = await evaluateCoupon(cart.workspaceId, code, subtotal, {
    lines: cart.items
      .map((item) => {
        const p = byId.get(item.productId);
        if (!p) return null;
        const variant = item.variantId ? p.variants.find((v) => v.id === item.variantId) : null;
        const unit = variant ? effectiveProductVariantPrice(p, variant) : effectivePrice(p);
        const qty =
          p.type === "PHYSICAL"
            ? Math.min(item.quantity, Math.max(variant?.stock ?? p.stock, 0))
            : item.quantity;
        return { productId: p.id, quantity: qty, unitPrice: unit };
      })
      .filter((line): line is { productId: string; quantity: number; unitPrice: number } =>
        Boolean(line)
      ),
  });
  if (!result.ok) return { ok: false, error: result.reason };

  cart.couponCode = code;
  await saveCart(cart);
  revalidatePath("/site", "layout");
  return { ok: true };
}

export async function removeCouponAction(): Promise<CartResult> {
  const cart = readCart();
  cart.couponCode = null;
  await saveCart(cart);
  revalidatePath("/site", "layout");
  return { ok: true };
}

export type CartDrawerLine = {
  productId: string;
  variantId: string | null;
  variantName: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  type: "DIGITAL" | "PHYSICAL";
  maxStock: number;
};

export type CartDrawerSnapshot = {
  lines: CartDrawerLine[];
  subtotal: number;
  count: number;
};

/**
 * Returns a lightweight serialisable snapshot of the current cart, scoped to
 * the given workspace. Used by the slide-out cart drawer on the public store.
 */
export async function getCartSnapshotAction(
  workspaceId: string
): Promise<CartDrawerSnapshot> {
  const cart = readCart();
  if (cart.workspaceId !== workspaceId || cart.items.length === 0) {
    return { lines: [], subtotal: 0, count: 0 };
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: cart.items.map((it) => it.productId) },
      workspaceId,
      status: "ACTIVE",
    },
    include: { image: true, variants: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines: CartDrawerLine[] = cart.items
    .map((it) => {
      const product = byId.get(it.productId);
      if (!product) return null;
      const variant = it.variantId
        ? product.variants.find(
            (candidate) => candidate.id === it.variantId && candidate.isActive
          )
        : null;
      if (it.variantId && !variant) return null;
      const unitPrice = variant ? effectiveProductVariantPrice(product, variant) : effectivePrice(product);
      const maxStock =
        product.type === "PHYSICAL"
          ? Math.max(variant?.stock ?? product.stock, 0)
          : 99;
      const quantity =
        product.type === "PHYSICAL"
          ? Math.min(it.quantity, maxStock)
          : it.quantity;
      if (quantity <= 0) return null;
      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        variantName: variant?.name ?? null,
        name: product.name,
        slug: product.slug,
        imageUrl: product.image?.url ?? null,
        unitPrice,
        quantity,
        lineTotal: unitPrice * quantity,
        type: product.type,
        maxStock,
      };
    })
    .filter((l): l is CartDrawerLine => l !== null);

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  return { lines, subtotal, count };
}
