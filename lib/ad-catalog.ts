/**
 * The id contract between the product catalog feed and ad events.
 *
 * Meta and TikTok join a pixel/server event to a catalog item by id. If an
 * event says `content_ids: ["abc"]` and the feed has no item "abc", dynamic
 * ads cannot show that product. So both sides use these rules:
 *
 * - A product without variants is one item, id = product id.
 * - A product with variants is one item per variant, id = variant id, and all
 *   of them share `item_group_id` = product id.
 * - Viewing a product with variants, before one is chosen, refers to the whole
 *   group: `content_type: "product_group"` with the product id.
 *
 * Client-safe: the browser pixels and the server share it.
 */

export const DEFAULT_AD_CURRENCY = "IDR";

export function catalogItemId(productId: string, variantId?: string | null) {
  return variantId || productId;
}

export function catalogContentType(hasVariants: boolean): "product" | "product_group" {
  return hasVariants ? "product_group" : "product";
}

/** ISO 4217 code for ad events and feeds; falls back to IDR. */
export function adCurrency(code: string | null | undefined) {
  const value = code?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(value) ? value : DEFAULT_AD_CURRENCY;
}
