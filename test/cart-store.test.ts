import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real Postgres: the cart is a table with a unique key per shopper, and what
// happens when a product is unpublished under a stored cart is a join.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  clearStoredCart,
  loadStoredCart,
  mergeCarts,
  persistCart,
} from "@/lib/cart-store";

let workspaceId = "";
let ownerId = "";
let customerId = "";
let productId = "";
let otherProductId = "";

beforeAll(async () => {
  const tag = `cart-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;
  const customer = await prisma.customer.create({
    data: { workspaceId, name: "Budi", email: `${tag}-budi@buildery.test` },
  });
  customerId = customer.id;
  const product = await prisma.product.create({
    data: { workspaceId, name: "Kaos", slug: "kaos", type: "PHYSICAL", status: "ACTIVE", price: 100_000, stock: 9 },
  });
  productId = product.id;
  const other = await prisma.product.create({
    data: { workspaceId, name: "Topi", slug: "topi", type: "PHYSICAL", status: "ACTIVE", price: 50_000, stock: 4 },
  });
  otherProductId = other.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("mergeCarts", () => {
  it("keeps the larger quantity for something in both carts", () => {
    const merged = mergeCarts(
      { workspaceId: "w", items: [{ productId: "p", variantId: null, quantity: 1 }], couponCode: null },
      { workspaceId: "w", items: [{ productId: "p", variantId: null, quantity: 3 }], couponCode: null }
    );
    // Doubling would be worse than either: the shopper wanted one cart, not two.
    expect(merged.items).toEqual([{ productId: "p", variantId: null, quantity: 3 }]);
  });

  it("treats two variants of a product as separate lines", () => {
    const merged = mergeCarts(
      { workspaceId: "w", items: [{ productId: "p", variantId: "a", quantity: 1 }], couponCode: null },
      { workspaceId: "w", items: [{ productId: "p", variantId: "b", quantity: 2 }], couponCode: null }
    );
    expect(merged.items).toHaveLength(2);
  });

  it("keeps whichever cart still had a coupon", () => {
    const merged = mergeCarts(
      { workspaceId: "w", items: [], couponCode: null },
      { workspaceId: "w", items: [], couponCode: "HEMAT10" }
    );
    expect(merged.couponCode).toBe("HEMAT10");
  });
});

describe("persistCart and loadStoredCart", () => {
  it("stores a signed-in shopper's cart and reads it back", async () => {
    await persistCart(
      {
        workspaceId,
        items: [{ productId, variantId: null, quantity: 2 }],
        couponCode: "HEMAT10",
      },
      { customerId }
    );

    const loaded = await loadStoredCart({ workspaceId, customerId });
    expect(loaded).toEqual({
      workspaceId,
      items: [{ productId, variantId: null, quantity: 2 }],
      couponCode: "HEMAT10",
    });
  });

  it("replaces the stored cart rather than appending to it", async () => {
    await persistCart(
      { workspaceId, items: [{ productId: otherProductId, variantId: null, quantity: 1 }], couponCode: null },
      { customerId }
    );
    const loaded = await loadStoredCart({ workspaceId, customerId });
    expect(loaded?.items).toEqual([
      { productId: otherProductId, variantId: null, quantity: 1 },
    ]);
    expect(await prisma.cart.count({ where: { workspaceId, customerId } })).toBe(1);
  });

  it("drops an item whose product was unpublished under it", async () => {
    await persistCart(
      { workspaceId, items: [{ productId, variantId: null, quantity: 1 }], couponCode: null },
      { customerId }
    );
    await prisma.product.update({ where: { id: productId }, data: { status: "DRAFT" } });

    // Handing it to checkout would only produce "no longer available".
    expect((await loadStoredCart({ workspaceId, customerId }))?.items).toEqual([]);
    await prisma.product.update({ where: { id: productId }, data: { status: "ACTIVE" } });
  });

  it("keeps an anonymous cart against its visitor id", async () => {
    await persistCart(
      { workspaceId, items: [{ productId, variantId: null, quantity: 1 }], couponCode: null },
      { visitorId: "visitor-1" }
    );
    const anonymous = await prisma.cart.findFirst({
      where: { workspaceId, visitorId: "visitor-1", customerId: null },
      include: { items: true },
    });
    expect(anonymous?.items).toHaveLength(1);
  });

  it("saves nothing it could never find again", async () => {
    const before = await prisma.cart.count({ where: { workspaceId } });
    await persistCart(
      { workspaceId, items: [{ productId, variantId: null, quantity: 1 }], couponCode: null },
      {}
    );
    expect(await prisma.cart.count({ where: { workspaceId } })).toBe(before);
  });

  it("never throws, so a failed save cannot break add-to-cart", async () => {
    await expect(
      persistCart(
        { workspaceId, items: [{ productId: "no-such-product", variantId: null, quantity: 1 }], couponCode: null },
        { customerId }
      )
    ).resolves.toBeUndefined();
  });

  it("has nothing stored for a shopper who never had a cart", async () => {
    expect(
      await loadStoredCart({ workspaceId, customerId: "someone-else" })
    ).toBeNull();
  });
});

describe("clearStoredCart", () => {
  it("removes the cart once it has become an order", async () => {
    await persistCart(
      { workspaceId, items: [{ productId, variantId: null, quantity: 1 }], couponCode: null },
      { customerId }
    );
    await clearStoredCart({ workspaceId, customerId });
    // Otherwise signing in elsewhere would restore an already-bought cart.
    expect(await loadStoredCart({ workspaceId, customerId })).toBeNull();
  });
});
