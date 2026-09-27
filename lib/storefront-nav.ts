// Shared (client + server safe) defaults and resolver for the public
// storefront header navigation labels. Overrides live on StorefrontSetting;
// a blank field falls back to the default English label.

export const DEFAULT_STORE_NAV = {
  blog: "Blog",
  courses: "Courses",
  products: "Products",
  memberships: "Memberships",
  cart: "Cart",
  account: "Account",
  login: "Login",
};

export type StoreNavLabels = typeof DEFAULT_STORE_NAV;

type StorefrontSettingLike = {
  navBlogLabel?: string | null;
  navCoursesLabel?: string | null;
  navProductsLabel?: string | null;
  navMembershipsLabel?: string | null;
  navCartLabel?: string | null;
  navAccountLabel?: string | null;
  navLoginLabel?: string | null;
} | null;

export function resolveStoreNav(setting?: StorefrontSettingLike): StoreNavLabels {
  return {
    blog: setting?.navBlogLabel?.trim() || DEFAULT_STORE_NAV.blog,
    courses: setting?.navCoursesLabel?.trim() || DEFAULT_STORE_NAV.courses,
    products: setting?.navProductsLabel?.trim() || DEFAULT_STORE_NAV.products,
    memberships:
      setting?.navMembershipsLabel?.trim() || DEFAULT_STORE_NAV.memberships,
    cart: setting?.navCartLabel?.trim() || DEFAULT_STORE_NAV.cart,
    account: setting?.navAccountLabel?.trim() || DEFAULT_STORE_NAV.account,
    login: setting?.navLoginLabel?.trim() || DEFAULT_STORE_NAV.login,
  };
}

export type StoreNavLink = { label: string; href: string };

/** Only allow external http(s), site-relative ("/..."), or anchor ("#...") hrefs. */
export function isSafeNavHref(href: string): boolean {
  const h = (href || "").trim();
  if (!h) return false;
  const lower = h.toLowerCase();
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    h.startsWith("/") ||
    h.startsWith("#")
  );
}

/** Validate + cap an arbitrary value into a clean custom-links array. */
export function sanitizeCustomLinks(input: unknown): StoreNavLink[] {
  if (!Array.isArray(input)) return [];
  const out: StoreNavLink[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const label = String((item as { label?: unknown }).label ?? "")
      .trim()
      .slice(0, 40);
    const href = String((item as { href?: unknown }).href ?? "")
      .trim()
      .slice(0, 300);
    if (label && href && isSafeNavHref(href)) out.push({ label, href });
    if (out.length >= 8) break;
  }
  return out;
}

export function resolveCustomLinks(
  setting?: { navCustomLinks?: unknown } | null
): StoreNavLink[] {
  return sanitizeCustomLinks(setting?.navCustomLinks);
}

type StoreFooterSettingLike = {
  footerEnabled?: boolean | null;
  footerText?: string | null;
  footerCopyright?: string | null;
} | null;

export type StoreFooterContent = {
  enabled: boolean;
  text: string;
  copyright: string;
};

/** Resolve the global footer content; copyright falls back to "© <year> <name>". */
export function resolveStoreFooter(
  setting: StoreFooterSettingLike,
  workspaceName: string
): StoreFooterContent {
  const year = new Date().getFullYear();
  return {
    enabled: Boolean(setting?.footerEnabled),
    text: setting?.footerText?.trim() || "",
    copyright:
      setting?.footerCopyright?.trim() || `© ${year} ${workspaceName}`,
  };
}
