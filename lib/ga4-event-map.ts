import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";

/**
 * GA4 recommended e-commerce events, from Buildery's (Meta-named) events.
 * Client-safe: the browser gtag and the server Measurement Protocol share it,
 * so a purchase reports the same items from both sides.
 *
 * `null` means no GA4 equivalent. PageView is not here: GA4 page_view is sent
 * by SitePageViewTracker with its own page parameters.
 */
export const GA4_EVENT_BY_META_EVENT: Record<MetaStandardEventName, string | null> = {
  PageView: null,
  ViewContent: "view_item",
  Search: "search",
  AddToCart: "add_to_cart",
  AddToWishlist: "add_to_wishlist",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Lead: "generate_lead",
  CompleteRegistration: "sign_up",
  Contact: null,
  CustomizeProduct: null,
  Donate: null,
  FindLocation: null,
  Schedule: null,
  StartTrial: null,
  SubmitApplication: null,
  Subscribe: null,
};

export function ga4EventName(eventName: MetaStandardEventName) {
  return GA4_EVENT_BY_META_EVENT[eventName] ?? null;
}

export type Ga4Item = {
  item_id: string;
  item_name?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
};

export type Ga4Params = {
  currency?: string;
  value?: number;
  transaction_id?: string;
  search_term?: string;
  items?: Ga4Item[];
};

export function ga4ParamsFromMeta(data: MetaCustomData | null | undefined): Ga4Params {
  const params: Ga4Params = {};
  if (!data) return params;

  const byId = new Map<string, Ga4Item>();
  for (const item of data.contents ?? []) {
    const id = String(item.id);
    byId.set(id, {
      item_id: id,
      ...(Number.isFinite(item.item_price) ? { price: item.item_price } : {}),
      ...(Number.isFinite(item.quantity) ? { quantity: item.quantity } : {}),
    });
  }
  for (const id of data.content_ids ?? []) {
    if (!byId.has(String(id))) byId.set(String(id), { item_id: String(id) });
  }
  const items = Array.from(byId.values()).slice(0, 200);
  if (items.length === 1) {
    if (data.content_name) items[0].item_name = data.content_name.slice(0, 100);
    if (data.content_category) items[0].item_category = data.content_category.slice(0, 100);
  }
  if (items.length > 0) params.items = items;
  if (data.currency) params.currency = data.currency.toUpperCase();
  if (Number.isFinite(data.value)) params.value = data.value;
  if (data.order_id) params.transaction_id = data.order_id.slice(0, 100);
  if (data.search_string) params.search_term = data.search_string.slice(0, 100);
  return params;
}
