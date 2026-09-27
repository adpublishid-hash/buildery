import "server-only";

import { adCurrency, catalogItemId } from "@/lib/ad-catalog";
import { prisma } from "@/lib/prisma";
import { publicSiteRoutePath, publicSiteUrl } from "@/lib/public-url";
import { stripRichText } from "@/lib/rich-text";

/**
 * Product catalog feed for Meta Commerce Manager, TikTok Catalog and Google
 * Merchant Center — all three read the Google Merchant RSS 2.0 format, so one
 * feed serves every platform.
 *
 * Item ids follow lib/ad-catalog.ts, which is what makes dynamic ads work: the
 * platform matches the ids in pixel and server events to these items.
 */

const MAX_ITEMS = 5000;
const MAX_DESCRIPTION = 5000;
const MAX_TITLE = 150;

export type CatalogFeedItem = {
  id: string;
  itemGroupId: string | null;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  availability: "in stock" | "out of stock";
  price: string;
  salePrice: string | null;
  brand: string;
  productType: string | null;
  size: string | null;
  color: string | null;
  sku: string | null;
};

export type CatalogFeed = {
  items: CatalogFeedItem[];
  /** Products left out because the platforms reject items without an image. */
  skippedWithoutImage: number;
  truncated: boolean;
};

type FeedWorkspace = { id: string; slug: string; name: string };

export async function buildCatalogFeed(workspace: FeedWorkspace): Promise<CatalogFeed> {
  const [setting, products] = await Promise.all([
    prisma.ecommerceSetting.findUnique({
      where: { workspaceId: workspace.id },
      select: { currencyCode: true },
    }),
    prisma.product.findMany({
      where: { workspaceId: workspace.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      take: MAX_ITEMS + 1,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        type: true,
        price: true,
        discountPrice: true,
        stock: true,
        sku: true,
        galleryImageIds: true,
        image: { select: { url: true } },
        category: { select: { name: true } },
        variants: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            discountPrice: true,
            stock: true,
            options: true,
            imageUrl: true,
            image: { select: { url: true } },
          },
        },
      },
    }),
  ]);

  const truncated = products.length > MAX_ITEMS;
  const galleryIds = Array.from(
    new Set(products.slice(0, MAX_ITEMS).flatMap((product) => product.galleryImageIds))
  );
  const gallery = galleryIds.length
    ? await prisma.uploadFile.findMany({
        where: { id: { in: galleryIds } },
        select: { id: true, url: true },
      })
    : [];
  const galleryUrlById = new Map(gallery.map((file) => [file.id, file.url]));

  const currency = adCurrency(setting?.currencyCode);
  const items: CatalogFeedItem[] = [];
  let skippedWithoutImage = 0;

  for (const product of products.slice(0, MAX_ITEMS)) {
    const productImage = product.image?.url ?? null;
    const additional = product.galleryImageIds
      .map((id) => galleryUrlById.get(id))
      .filter((url): url is string => Boolean(url))
      .map((url) => absoluteAssetUrl(workspace.slug, url))
      .slice(0, 10);
    const description = describe(product.description, product.name);
    const link = productUrl(workspace.slug, product.slug);
    const physical = product.type === "PHYSICAL";

    if (product.variants.length === 0) {
      if (!productImage) {
        skippedWithoutImage += 1;
        continue;
      }
      items.push({
        id: catalogItemId(product.id),
        itemGroupId: null,
        title: product.name.slice(0, MAX_TITLE),
        description,
        link,
        imageLink: absoluteAssetUrl(workspace.slug, productImage),
        additionalImageLinks: additional,
        availability: !physical || product.stock > 0 ? "in stock" : "out of stock",
        ...prices(product.price, product.discountPrice, currency),
        brand: workspace.name,
        productType: product.category?.name ?? null,
        size: null,
        color: null,
        sku: product.sku,
      });
      continue;
    }

    let variantsWithImage = 0;
    for (const variant of product.variants) {
      const image = variant.image?.url ?? variant.imageUrl ?? productImage;
      if (!image) continue;
      variantsWithImage += 1;
      const options = readOptions(variant.options);
      items.push({
        id: catalogItemId(product.id, variant.id),
        itemGroupId: product.id,
        title: `${product.name} - ${variant.name}`.slice(0, MAX_TITLE),
        description,
        link: `${link}?variant=${encodeURIComponent(variant.id)}`,
        imageLink: absoluteAssetUrl(workspace.slug, image),
        additionalImageLinks: additional,
        availability: !physical || variant.stock > 0 ? "in stock" : "out of stock",
        ...prices(
          variant.price ?? product.price,
          variant.discountPrice ?? (variant.price == null ? product.discountPrice : null),
          currency
        ),
        brand: workspace.name,
        productType: product.category?.name ?? null,
        size: options.size,
        color: options.color,
        sku: variant.sku ?? product.sku,
      });
    }
    if (variantsWithImage === 0) skippedWithoutImage += 1;
  }

  return { items, skippedWithoutImage, truncated };
}

export function renderCatalogFeedXml(workspace: FeedWorkspace, feed: CatalogFeed) {
  const tag = (name: string, value: string | null | undefined) =>
    value ? `      <g:${name}>${escapeXml(value)}</g:${name}>\n` : "";

  const items = feed.items
    .map(
      (item) =>
        "    <item>\n" +
        tag("id", item.id) +
        tag("item_group_id", item.itemGroupId) +
        tag("title", item.title) +
        tag("description", item.description) +
        tag("link", item.link) +
        tag("image_link", item.imageLink) +
        item.additionalImageLinks.map((url) => tag("additional_image_link", url)).join("") +
        tag("availability", item.availability) +
        tag("price", item.price) +
        tag("sale_price", item.salePrice) +
        tag("condition", "new") +
        tag("brand", item.brand) +
        tag("product_type", item.productType) +
        tag("size", item.size) +
        tag("color", item.color) +
        tag("mpn", item.sku) +
        // No GTIN/barcode is stored, so the item has no official identifiers.
        tag("identifier_exists", item.sku ? null : "no") +
        "    </item>\n"
    )
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
    "  <channel>\n" +
    `    <title>${escapeXml(workspace.name)}</title>\n` +
    `    <link>${escapeXml(productUrl(workspace.slug, ""))}</link>\n` +
    `    <description>${escapeXml(`Katalog produk ${workspace.name}`)}</description>\n` +
    items +
    "  </channel>\n" +
    "</rss>\n"
  );
}

/** The feed's public URL, for the settings page. */
export function catalogFeedUrl(workspaceSlug: string) {
  return absoluteSiteUrl(workspaceSlug, "catalog.xml");
}

function prices(price: number, discountPrice: number | null, currency: string) {
  const format = (amount: number) => `${amount.toFixed(2)} ${currency}`;
  return {
    price: format(price),
    salePrice:
      discountPrice != null && discountPrice > 0 && discountPrice < price
        ? format(discountPrice)
        : null,
  };
}

function describe(description: string | null, fallback: string) {
  const text = description ? stripRichText(description).replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, MAX_DESCRIPTION);
}

/** Variant options are free-form; recognise the common size/colour keys. */
function readOptions(value: unknown): { size: string | null; color: string | null } {
  const result = { size: null as string | null, color: null as string | null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const name = key.trim().toLowerCase();
    if (!result.size && ["size", "ukuran"].includes(name)) result.size = raw.trim();
    if (!result.color && ["color", "colour", "warna"].includes(name)) result.color = raw.trim();
  }
  return result;
}

function productUrl(workspaceSlug: string, productSlug: string) {
  return absoluteSiteUrl(workspaceSlug, productSlug ? `products/${productSlug}` : "");
}

/** Platforms fetch these URLs themselves, so they must be absolute. */
function absoluteSiteUrl(workspaceSlug: string, path: string) {
  const localOrigin = localAppOrigin();
  return localOrigin
    ? `${localOrigin}${publicSiteRoutePath(workspaceSlug, path)}`
    : publicSiteUrl(workspaceSlug, path);
}

function absoluteAssetUrl(workspaceSlug: string, url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = localAppOrigin() ?? publicSiteUrl(workspaceSlug, "");
  return `${origin.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

function localAppOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

function escapeXml(value: string) {
  return value
    // Characters XML 1.0 forbids outright; they would make the whole feed invalid.
    .replace(/[ --]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
