// Pure menu matching, shared by the sidebar highlight and the header breadcrumb.

import { dashboardNav, type NavItem } from "./nav-config";

export type NavLocation = { item: NavItem; child: NavItem | null };

/** Minimal read-only view of URLSearchParams, as returned by useSearchParams. */
type SearchLike = { get(name: string): string | null } | null;

/**
 * How well a menu href describes the current URL, or -1 when it does not.
 *
 * Paths match exactly or as a prefix (a record under a list page). A query in
 * the href (`/dashboard/settings?tab=ecommerce`) must agree with the URL for
 * every key the URL actually sets; agreeing earns a bonus, so the settings
 * page opened on the eCommerce tab lights up eCommerce's shortcut, not
 * "General". A key the URL leaves out is a weaker match, unless the item is
 * the page's default (`isDefault`).
 */
function matchScore(item: NavItem, pathname: string, search: SearchLike) {
  const [path, query] = item.href.split("?");
  const pathHit =
    pathname === path || (path !== "/dashboard" && pathname.startsWith(`${path}/`));
  if (!pathHit) return -1;
  let score = path.length * 4;
  if (query) {
    for (const [key, value] of new URLSearchParams(query)) {
      const actual = search?.get(key);
      // The URL doesn't pick a tab: still a match, but weaker than the plain
      // page entry, so /dashboard/settings is "Settings", not "Notifications".
      if (actual == null) {
        score += item.isDefault ? 2 : -1;
        continue;
      }
      if (actual !== value) return -1;
      score += 2;
    }
  }
  return score;
}

/**
 * Where the current page sits in the menu: the top-level entry and, when the
 * page belongs to one of its children, that child. On a tie, an entry whose
 * own top-level item also matches wins, so /dashboard/settings is
 * "Settings", not eCommerce's shortcut to it.
 */
export function locateInNav(pathname: string, search: SearchLike = null): NavLocation | null {
  let best: (NavLocation & { score: number }) | null = null;
  for (const section of dashboardNav) {
    for (const item of section.items) {
      const own = matchScore(item, pathname, search) >= 0 ? 1 : 0;
      for (const child of item.children ?? []) {
        const hit = matchScore(child, pathname, search);
        if (hit < 0) continue;
        const score = hit + own;
        if (!best || score > best.score) best = { item, child, score };
      }
      if (own) {
        const score = matchScore(item, pathname, search) + 1;
        if (!best || score > best.score) best = { item, child: null, score };
      }
    }
  }
  return best ? { item: best.item, child: best.child } : null;
}
