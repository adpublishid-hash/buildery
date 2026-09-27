import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";

/**
 * Buildery records every event once, under Meta's standard names, and each ad
 * platform receives it under its own. Client-safe: the browser pixel and the
 * server Events API share this table, so both sides agree on the event name
 * TikTok deduplicates against.
 *
 * `null` means TikTok has no equivalent and the event is not sent. PageView is
 * the browser pixel's `ttq.page()`, which TikTok does not deduplicate against
 * a server event, so there is no server twin for it.
 */
export const TIKTOK_EVENT_BY_META_EVENT: Record<MetaStandardEventName, string | null> = {
  PageView: null,
  ViewContent: "ViewContent",
  Search: "Search",
  AddToCart: "AddToCart",
  AddToWishlist: "AddToWishlist",
  InitiateCheckout: "InitiateCheckout",
  AddPaymentInfo: "AddPaymentInfo",
  Purchase: "CompletePayment",
  Lead: "SubmitForm",
  CompleteRegistration: "CompleteRegistration",
  Contact: "Contact",
  CustomizeProduct: "CustomizeProduct",
  Donate: null,
  FindLocation: "FindLocation",
  Schedule: "Schedule",
  StartTrial: "StartTrial",
  SubmitApplication: "SubmitApplication",
  Subscribe: "Subscribe",
};

export function tiktokEventName(eventName: MetaStandardEventName) {
  return TIKTOK_EVENT_BY_META_EVENT[eventName] ?? null;
}

export type TikTokProperties = {
  contents?: { content_id: string; content_name?: string; quantity?: number; price?: number }[];
  content_type?: "product" | "product_group";
  currency?: string;
  value?: number;
  order_id?: string;
  query?: string;
};

/** Translates Meta-shaped custom data into TikTok `properties`. */
export function tiktokPropertiesFromMeta(
  data: MetaCustomData | null | undefined
): TikTokProperties | null {
  if (!data) return null;
  const properties: TikTokProperties = {};

  const byId = new Map<string, { content_id: string; content_name?: string; quantity?: number; price?: number }>();
  for (const item of data.contents ?? []) {
    const id = String(item.id);
    byId.set(id, {
      content_id: id,
      ...(Number.isFinite(item.quantity) ? { quantity: item.quantity } : {}),
      ...(Number.isFinite(item.item_price) ? { price: item.item_price } : {}),
    });
  }
  for (const id of data.content_ids ?? []) {
    if (!byId.has(String(id))) byId.set(String(id), { content_id: String(id) });
  }
  const contents = Array.from(byId.values()).slice(0, 100);
  if (contents.length === 1 && data.content_name) {
    contents[0].content_name = data.content_name.slice(0, 200);
  }
  if (contents.length > 0) {
    properties.contents = contents;
    // TikTok accepts only these two. A product viewed before a variant is
    // chosen is the whole group; see lib/ad-catalog.ts.
    properties.content_type =
      data.content_type === "product_group" ? "product_group" : "product";
  }
  if (data.currency) properties.currency = data.currency.toUpperCase();
  if (Number.isFinite(data.value)) properties.value = data.value;
  if (data.order_id) properties.order_id = data.order_id.slice(0, 100);
  if (data.search_string) properties.query = data.search_string.slice(0, 100);

  return Object.keys(properties).length > 0 ? properties : null;
}
