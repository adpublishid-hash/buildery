import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Against a real Postgres: what the catalogue must never show — drafts, another
// shop's products — is a database condition, and paging is too.
vi.mock("server-only", () => ({}));
// unstable_cache needs a request scope; here the point is the query it wraps.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  catalogTag,
  relatedStorefrontProducts,
  storefrontCategories,
  storefrontProducts,
} from "@/lib/storefront-catalog";

let workspaceId = "";
let otherWorkspaceId = "";
let ownerId = "";
let categoryId = "";

beforeAll(async () => {
  const tag = `catalog-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;
  const other = await prisma.workspace.create({
    data: { name: `${tag}-other`, slug: `${tag}-other`, createdById: owner.id },
  });
  otherWorkspaceId = other.id;

  const category = await prisma.productCategory.create({
    data: { workspaceId, name: "Atasan", slug: "atasan" },
  });
  categoryId = category.id;

  await prisma.product.create({
    data: { workspaceId, categoryId, name: "Kaos Polos", slug: "kaos", type: "PHYSICAL", status: "ACTIVE", price: 100_000, stock: 5 },
  });
  await prisma.product.create({
    data: { workspaceId, categoryId, name: "Kemeja", slug: "kemeja", type: "PHYSICAL", status: "ACTIVE", price: 250_000, stock: 2 },
  });
  await prisma.product.create({
    data: { workspaceId, name: "Draf", slug: "draf", type: "PHYSICAL", status: "DRAFT", price: 90_000 },
  });
  await prisma.product.create({
    data: { workspaceId: otherWorkspaceId, name: "Toko Lain", slug: "lain", type: "PHYSICAL", status: "ACTIVE", price: 10_000 },
  });
});

afterAll(async () => {
  await prisma.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("catalogTag", () => {
  it("is scoped to one shop, so editing one never drops another's cache", () => {
    expect(catalogTag("w1")).not.toBe(catalogTag("w2"));
  });
});

describe("storefrontProducts", () => {
  const base = { workspaceId: "", sort: "newest" as const, page: 1, pageSize: 24 };

  it("returns only this shop's published products", async () => {
    const result = await storefrontProducts({ ...base, workspaceId });
    const slugs = result.items.map((item) => item.slug).sort();
    expect(slugs).toEqual(["kaos", "kemeja"]);
    expect(result.total).toBe(2);
  });

  it("hands back a plain shape the cache can round-trip", async () => {
    const result = await storefrontProducts({ ...base, workspaceId });
    const card = result.items[0];
    // A cached Prisma model would return strings where Dates were promised.
    expect(Object.keys(card).sort()).toEqual([
      "discountPrice",
      "id",
      "imageUrl",
      "name",
      "price",
      "slug",
      "stock",
      "type",
      "variants",
    ]);
  });

  it("filters by category, price and search", async () => {
    expect(
      (await storefrontProducts({ ...base, workspaceId, category: "atasan" })).total
    ).toBe(2);
    expect(
      (await storefrontProducts({ ...base, workspaceId, minPrice: 200_000 })).items.map(
        (item) => item.slug
      )
    ).toEqual(["kemeja"]);
    expect(
      (await storefrontProducts({ ...base, workspaceId, query: "kaos" })).items.map(
        (item) => item.slug
      )
    ).toEqual(["kaos"]);
  });

  it("sorts and pages without losing the total", async () => {
    const cheapest = await storefrontProducts({
      ...base,
      workspaceId,
      sort: "price-asc",
      pageSize: 1,
    });
    expect(cheapest.items.map((item) => item.slug)).toEqual(["kaos"]);
    // The count is of everything that matched, not of the page.
    expect(cheapest.total).toBe(2);

    const second = await storefrontProducts({
      ...base,
      workspaceId,
      sort: "price-asc",
      page: 2,
      pageSize: 1,
    });
    expect(second.items.map((item) => item.slug)).toEqual(["kemeja"]);
  });
});

describe("storefrontCategories", () => {
  it("lists only categories that still have something to sell", async () => {
    const categories = await storefrontCategories(workspaceId);
    expect(categories.map((entry) => entry.slug)).toEqual(["atasan"]);

    const empty = await prisma.productCategory.create({
      data: { workspaceId, name: "Kosong", slug: "kosong" },
    });
    expect(
      (await storefrontCategories(workspaceId)).map((entry) => entry.slug)
    ).not.toContain("kosong");
    await prisma.productCategory.delete({ where: { id: empty.id } });
  });
});

describe("relatedStorefrontProducts", () => {
  it("suggests the category's other products, never the one being viewed", async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { workspaceId, slug: "kaos" },
    });
    const related = await relatedStorefrontProducts({
      workspaceId,
      productId: product.id,
      categoryId,
    });
    expect(related.map((item) => item.slug)).toEqual(["kemeja"]);
  });

  it("falls back to the rest of the shop when the product has no category", async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { workspaceId, slug: "kaos" },
    });
    const related = await relatedStorefrontProducts({
      workspaceId,
      productId: product.id,
      categoryId: null,
    });
    expect(related.map((item) => item.slug)).toContain("kemeja");
    expect(related.map((item) => item.slug)).not.toContain("draf");
  });
});
