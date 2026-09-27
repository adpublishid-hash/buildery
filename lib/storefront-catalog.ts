import "server-only";

import { unstable_cache, revalidateTag } from "next/cache";
import type { Prisma, ProductType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { bundleStock } from "@/lib/bundle-queries";

/**
 * The catalogue as the storefront reads it.
 *
 * Every visitor to a category page ran the same queries from scratch — the
 * catalogue is identical for all of them and changes only when the merchant
 * edits it. These results are cached and dropped by tag on any product change,
 * so the shop stays fast without ever serving a stale price.
 *
 * The shapes are plain and serialisable on purpose: `unstable_cache` round-trips
 * through JSON, and a cached Prisma model would hand back strings where the
 * types promise Dates.
 */

export function catalogTag(workspaceId: string) {
  return `catalog:${workspaceId}`;
}

/**
 * Call after anything that changes what the shop displays.
 *
 * Never throws. It is called from the payment path, where the money is already
 * captured — a cache hint that cannot be delivered must not take an order down
 * with it. The worst case is a card showing stale stock for the TTL, which
 * checkout re-validates anyway.
 */
export function revalidateCatalog(workspaceId: string) {
  try {
    revalidateTag(catalogTag(workspaceId));
  } catch {
    // Outside a request scope (a job, a test): nothing to invalidate.
  }
}

/** How long a page may serve the cached catalogue if no edit invalidates it. */
const CATALOG_TTL_SECONDS = 300;

export type StorefrontCard = {
  id: string;
  name: string;
  slug: string;
  type: ProductType;
  price: number;
  discountPrice: number | null;
  stock: number;
  imageUrl: string | null;
  /** Enough for the card to show a price range when variants differ. */
  variants: { price: number | null; isActive: boolean }[];
};

const cardSelect = {
  id: true,
  name: true,
  slug: true,
  type: true,
  price: true,
  discountPrice: true,
  stock: true,
  image: { select: { url: true } },
  variants: { select: { price: true, isActive: true } },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

/**
 * A bundle stores no stock of its own, so the card has to ask what its contents
 * allow. Done once per page of results rather than per card.
 */
async function withBundleStock(rows: CardRow[]): Promise<StorefrontCard[]> {
  const cards = rows.map(toCard);
  const bundleIds = rows
    .filter((row) => row.type === "BUNDLE")
    .map((row) => row.id);
  if (bundleIds.length === 0) return cards;

  const stock = await bundleStock(bundleIds);
  return cards.map((card) =>
    card.type === "BUNDLE" ? { ...card, stock: stock.get(card.id) ?? 0 } : card
  );
}

function toCard(row: CardRow): StorefrontCard {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    price: row.price,
    discountPrice: row.discountPrice,
    stock: row.stock,
    imageUrl: row.image?.url ?? null,
    variants: row.variants,
  };
}

export type StorefrontCategory = { id: string; name: string; slug: string };

export async function storefrontCategories(
  workspaceId: string
): Promise<StorefrontCategory[]> {
  return unstable_cache(
    async () =>
      prisma.productCategory.findMany({
        where: { workspaceId, products: { some: { status: "ACTIVE" } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      }),
    ["storefront-categories", workspaceId],
    { tags: [catalogTag(workspaceId)], revalidate: CATALOG_TTL_SECONDS }
  )();
}

export type CatalogSort = "newest" | "oldest" | "price-asc" | "price-desc" | "name";

export type CatalogQuery = {
  workspaceId: string;
  category?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: CatalogSort;
  page: number;
  pageSize: number;
};

function catalogWhere(input: CatalogQuery): Prisma.ProductWhereInput {
  return {
    workspaceId: input.workspaceId,
    status: "ACTIVE",
    ...(input.category ? { category: { slug: input.category } } : {}),
    ...(input.query
      ? {
          OR: [
            { name: { contains: input.query, mode: "insensitive" } },
            { description: { contains: input.query, mode: "insensitive" } },
            { sku: { contains: input.query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(input.minPrice || input.maxPrice
      ? {
          price: {
            ...(input.minPrice ? { gte: input.minPrice } : {}),
            ...(input.maxPrice ? { lte: input.maxPrice } : {}),
          },
        }
      : {}),
  };
}

function catalogOrder(sort: CatalogSort): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case "oldest":
      return { createdAt: "asc" };
    case "price-asc":
      return { price: "asc" };
    case "price-desc":
      return { price: "desc" };
    case "name":
      return { name: "asc" };
    default:
      return { createdAt: "desc" };
  }
}

export async function storefrontProducts(
  input: CatalogQuery
): Promise<{ items: StorefrontCard[]; total: number }> {
  // Every distinct filter combination is its own cache entry; they all drop
  // together when the tag is invalidated.
  const key = [
    "storefront-products",
    input.workspaceId,
    input.category ?? "",
    input.query ?? "",
    String(input.minPrice ?? 0),
    String(input.maxPrice ?? 0),
    input.sort,
    String(input.page),
    String(input.pageSize),
  ];

  return unstable_cache(
    async () => {
      const where = catalogWhere(input);
      const [rows, total] = await Promise.all([
        prisma.product.findMany({
          where,
          select: cardSelect,
          orderBy: catalogOrder(input.sort),
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        prisma.product.count({ where }),
      ]);
      return { items: await withBundleStock(rows), total };
    },
    key,
    { tags: [catalogTag(input.workspaceId)], revalidate: CATALOG_TTL_SECONDS }
  )();
}

export async function relatedStorefrontProducts(input: {
  workspaceId: string;
  productId: string;
  categoryId: string | null;
  take?: number;
}): Promise<StorefrontCard[]> {
  const take = input.take ?? 4;
  return unstable_cache(
    async () => {
      const rows = await prisma.product.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: "ACTIVE",
          id: { not: input.productId },
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        },
        select: cardSelect,
        orderBy: { createdAt: "desc" },
        take,
      });
      return withBundleStock(rows);
    },
    [
      "storefront-related",
      input.workspaceId,
      input.productId,
      input.categoryId ?? "",
      String(take),
    ],
    { tags: [catalogTag(input.workspaceId)], revalidate: CATALOG_TTL_SECONDS }
  )();
}
