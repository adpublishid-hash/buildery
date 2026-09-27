import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real Postgres: who is "waiting" is a query across products and variants, and
// the once-only guarantee is a conditional update.
vi.mock("server-only", () => ({}));

const sendStoreEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store-notifications", () => ({ sendStoreEmail }));

import { prisma } from "@/lib/prisma";
import {
  normalizeEmail,
  stockTargetKey,
  sweepStockNotifications,
} from "@/lib/stock-notifications";

let workspaceId = "";
let ownerId = "";
let inStockId = "";
let soldOutId = "";
let variantId = "";

beforeAll(async () => {
  const tag = `stock-notify-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;

  const back = await prisma.product.create({
    data: { workspaceId, name: "Kaos", slug: "kaos", type: "PHYSICAL", status: "ACTIVE", price: 100_000, stock: 5 },
  });
  inStockId = back.id;
  const still = await prisma.product.create({
    data: { workspaceId, name: "Topi", slug: "topi", type: "PHYSICAL", status: "ACTIVE", price: 50_000, stock: 0 },
  });
  soldOutId = still.id;
  const variant = await prisma.productVariant.create({
    data: { productId: still.id, name: "Merah", stock: 3 },
  });
  variantId = variant.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("stockTargetKey", () => {
  it("separates a product from its variants, and survives a missing variant", () => {
    expect(stockTargetKey("p1", null)).toBe("p1:");
    expect(stockTargetKey("p1", "v1")).toBe("p1:v1");
    expect(stockTargetKey("p1", undefined)).toBe("p1:");
  });
});

describe("normalizeEmail", () => {
  it("folds case and trims, so one person signs up once", () => {
    expect(normalizeEmail("  Budi@Contoh.TEST ")).toBe("budi@contoh.test");
  });
});

describe("sweepStockNotifications", () => {
  it("emails only the people whose product actually came back", async () => {
    sendStoreEmail.mockResolvedValue(undefined);
    await prisma.stockNotification.createMany({
      data: [
        { workspaceId, productId: inStockId, targetKey: stockTargetKey(inStockId), email: "back@contoh.test" },
        { workspaceId, productId: soldOutId, targetKey: stockTargetKey(soldOutId), email: "waiting@contoh.test" },
        { workspaceId, productId: soldOutId, variantId, targetKey: stockTargetKey(soldOutId, variantId), email: "variant@contoh.test" },
      ],
    });

    const summary = await sweepStockNotifications();

    // The product with stock, and the variant with stock — not the sold-out one.
    expect(summary.notified).toBe(2);
    const emailed = sendStoreEmail.mock.calls.map(([input]) => input.recipient).sort();
    expect(emailed).toEqual(["back@contoh.test", "variant@contoh.test"]);
    expect(sendStoreEmail.mock.calls[0][0].event).toBe("BACK_IN_STOCK");
  });

  it("never emails the same signup twice", async () => {
    sendStoreEmail.mockClear();
    const summary = await sweepStockNotifications();
    expect(summary.notified).toBe(0);
    expect(sendStoreEmail).not.toHaveBeenCalled();
  });

  it("keeps going when one email fails, and leaves that one unsent", async () => {
    sendStoreEmail.mockClear();
    await prisma.stockNotification.updateMany({
      where: { workspaceId },
      data: { notifiedAt: null },
    });
    sendStoreEmail.mockRejectedValueOnce(new Error("smtp down")).mockResolvedValue(undefined);

    const summary = await sweepStockNotifications();

    expect(summary.notified).toBe(1);
    expect(sendStoreEmail).toHaveBeenCalledTimes(2);
  });

  it("ignores a product that is no longer published", async () => {
    sendStoreEmail.mockClear();
    await prisma.product.update({ where: { id: inStockId }, data: { status: "DRAFT" } });
    await prisma.stockNotification.updateMany({
      where: { workspaceId },
      data: { notifiedAt: null },
    });

    await sweepStockNotifications();

    const emailed = sendStoreEmail.mock.calls.map(([input]) => input.recipient);
    // Pointing a shopper at an unpublished product is a 404.
    expect(emailed).not.toContain("back@contoh.test");
  });
});
