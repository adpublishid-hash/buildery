import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real Postgres: placement is a table with a unique key per location, and the
// "unplaced" figure only means anything against the product's own stock.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  productStockPlacement,
  setLocationStock,
  transferLocationStock,
} from "@/lib/location-stock";

let workspaceId = "";
let ownerId = "";
let productId = "";
let gudangA = "";
let gudangB = "";

beforeAll(async () => {
  const tag = `locstock-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;

  const setting = await prisma.ecommerceSetting.create({ data: { workspaceId } });
  const a = await prisma.pickupLocation.create({
    data: { workspaceId, settingId: setting.id, name: "Gudang A", address: "Jl. A" },
  });
  gudangA = a.id;
  const b = await prisma.pickupLocation.create({
    data: { workspaceId, settingId: setting.id, name: "Gudang B", address: "Jl. B" },
  });
  gudangB = b.id;

  const product = await prisma.product.create({
    data: { workspaceId, name: "Kaos", slug: "kaos", type: "PHYSICAL", status: "ACTIVE", price: 100_000, stock: 10 },
  });
  productId = product.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("setLocationStock", () => {
  it("records where the stock is and what is still unplaced", async () => {
    expect(await setLocationStock({ workspaceId, locationId: gudangA, productId, quantity: 6 })).toEqual({
      ok: true,
      placed: 6,
    });

    const placement = await productStockPlacement({ workspaceId, productId });
    expect(placement.placed).toBe(6);
    // The gap is the useful number: four shirts are somewhere nobody recorded.
    expect(placement.unplaced).toBe(4);
    expect(placement.rows[0]).toMatchObject({ locationName: "Gudang A", quantity: 6 });
  });

  it("replaces the count rather than adding to it", async () => {
    await setLocationStock({ workspaceId, locationId: gudangA, productId, quantity: 3 });
    expect((await productStockPlacement({ workspaceId, productId })).placed).toBe(3);
  });

  it("treats zero as no record at all", async () => {
    await setLocationStock({ workspaceId, locationId: gudangA, productId, quantity: 0 });
    const placement = await productStockPlacement({ workspaceId, productId });
    expect(placement.rows).toEqual([]);
    expect(placement.unplaced).toBe(10);
  });

  it("refuses a negative count and another shop's location", async () => {
    expect(
      (await setLocationStock({ workspaceId, locationId: gudangA, productId, quantity: -1 })).ok
    ).toBe(false);
    expect(
      (await setLocationStock({ workspaceId, locationId: "not-a-location", productId, quantity: 1 })).ok
    ).toBe(false);
  });

  it("says when more has been placed than the product has", async () => {
    await setLocationStock({ workspaceId, locationId: gudangA, productId, quantity: 12 });
    // Over-placed: someone counted wrong, and the figure should say so.
    expect((await productStockPlacement({ workspaceId, productId })).unplaced).toBe(-2);
    await setLocationStock({ workspaceId, locationId: gudangA, productId, quantity: 0 });
  });
});

describe("transferLocationStock", () => {
  it("moves stock without changing the total placed", async () => {
    await setLocationStock({ workspaceId, locationId: gudangA, productId, quantity: 10 });

    const result = await transferLocationStock({
      workspaceId,
      fromLocationId: gudangA,
      toLocationId: gudangB,
      productId,
      quantity: 4,
    });
    expect(result).toEqual({ ok: true, placed: 10 });

    const placement = await productStockPlacement({ workspaceId, productId });
    expect(
      placement.rows.map((row) => [row.locationName, row.quantity]).sort()
    ).toEqual([
      ["Gudang A", 6],
      ["Gudang B", 4],
    ]);
  });

  it("refuses to move more than is there", async () => {
    const result = await transferLocationStock({
      workspaceId,
      fromLocationId: gudangB,
      toLocationId: gudangA,
      productId,
      quantity: 99,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a move to the same place, and a move of nothing", async () => {
    expect(
      (await transferLocationStock({ workspaceId, fromLocationId: gudangA, toLocationId: gudangA, productId, quantity: 1 })).ok
    ).toBe(false);
    expect(
      (await transferLocationStock({ workspaceId, fromLocationId: gudangA, toLocationId: gudangB, productId, quantity: 0 })).ok
    ).toBe(false);
  });

  it("removes the source row when it empties", async () => {
    await transferLocationStock({
      workspaceId,
      fromLocationId: gudangB,
      toLocationId: gudangA,
      productId,
      quantity: 4,
    });
    const placement = await productStockPlacement({ workspaceId, productId });
    expect(placement.rows.map((row) => row.locationName)).toEqual(["Gudang A"]);
    expect(placement.placed).toBe(10);
  });
});
