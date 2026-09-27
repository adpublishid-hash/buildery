"use client";

/**
 * Lets a builder page tell the layout's page-view tracker which Page row it is.
 *
 * Page views are recorded once, by one tracker in the public layout, so every
 * storefront page counts — product, cart, checkout, course, blog. Only builder
 * pages have a Page row to attribute the view to, and only they render this.
 *
 * The id is stored during render, which happens before any effect, so the
 * tracker always sees it.
 */

let currentPageId: string | null = null;

export function readCurrentPageId() {
  return currentPageId;
}

export function PageIdBeacon({ pageId }: { pageId: string }) {
  currentPageId = pageId;
  return null;
}

/** Test hook. */
export function resetCurrentPageId() {
  currentPageId = null;
}
