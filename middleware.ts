import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  PUBLIC_SITE_DOMAIN,
  getPublicWorkspaceSlugFromHost,
  isPublicRootHost,
  isWorkspaceSlug,
  normalizePublicPath,
} from "@/lib/public-url";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_COOKIE_MAX_AGE,
  decodeAttribution,
  encodeAttribution,
  hasAttribution,
  mergeAttribution,
  readAttributionFromUrl,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE,
  FBC_COOKIE,
  FBC_COOKIE_MAX_AGE,
  TTCLID_COOKIE,
  TTCLID_COOKIE_MAX_AGE,
  readAdClickCookies,
} from "@/lib/analytics-visitor";

const PROTECTED = ["/dashboard", "/admin", "/verify", "/onboarding"];
const APP_ROUTE_SEGMENTS = new Set([
  "admin",
  "api",
  "dashboard",
  "forgot-password",
  "learn",
  "login",
  "onboarding",
  "payment",
  "pricing",
  "r",
  "register",
  "reset-password",
  "site",
  "verify",
]);

const PUBLIC_FILE = /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|png|svg|txt|webmanifest|webp|woff2?)$/i;
const INTERNAL_SITE_REWRITE_HEADER = "x-buildery-site-rewrite";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Resolved before anything branches, so every response below carries the
  // same visitor identity and first-touch campaign.
  const analytics = resolveAnalyticsCookies(req);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");

  // Legacy public form attachments must never be served as same-origin files.
  if (pathname.startsWith("/uploads/form-submissions/")) {
    return new NextResponse(null, { status: 404 });
  }

  if (req.headers.get(INTERNAL_SITE_REWRITE_HEADER) !== "1") {
    const subdomainSlug = getPublicWorkspaceSlugFromHost(host);
    if (subdomainSlug) {
      const canonicalSlug = await resolveWorkspaceSlug(subdomainSlug);
      if (canonicalSlug === null) {
        return withAnalytics(new NextResponse("Not Found", { status: 404 }), analytics);
      }
      if (canonicalSlug && canonicalSlug !== subdomainSlug) {
        return withAnalytics(redirectToPublicSubdomain(req, canonicalSlug, pathname), analytics);
      }
      const canonical = canonicalizeSubdomainSitePath(req);
      if (canonical) return withAnalytics(canonical, analytics);

      if (shouldRewriteSubdomainPath(pathname)) {
        const url = req.nextUrl.clone();
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set(INTERNAL_SITE_REWRITE_HEADER, "1");

        url.pathname = `/site/${subdomainSlug}${normalizePublicPath(pathname)}`;
        return withAnalytics(NextResponse.rewrite(url, {
          request: { headers: requestHeaders },
        }), analytics);
      }
    }

    // Custom domain: host isn't a platform subdomain/root → resolve via DB.
    if (
      !subdomainSlug &&
      !isPublicRootHost(host) &&
      !isInternalHost(host) &&
      shouldRewriteSubdomainPath(pathname)
    ) {
      const customSlug = await resolveCustomDomainSlug(host!);
      if (customSlug) {
        const url = req.nextUrl.clone();
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set(INTERNAL_SITE_REWRITE_HEADER, "1");
        url.pathname = `/site/${customSlug}${normalizePublicPath(pathname)}`;
        return withAnalytics(NextResponse.rewrite(url, {
          request: { headers: requestHeaders },
        }), analytics);
      }
    }

    const legacyRedirect = redirectLegacyPublicSiteUrl(req, host);
    if (legacyRedirect) return legacyRedirect;
  }

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return withAnalytics(NextResponse.next(), analytics);

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Anonymous → /login (preserve where they wanted to go).
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return withAnalytics(NextResponse.redirect(url), analytics);
  }

  if (token.disabled) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "AccountDisabled");
    return withAnalytics(NextResponse.redirect(url), analytics);
  }

  const verified = Boolean(token.emailVerified);

  // /verify is for unverified accounts only — once confirmed, kick them
  // out so they don't keep seeing the OTP screen.
  if (pathname.startsWith("/verify") && verified) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return withAnalytics(NextResponse.redirect(url), analytics);
  }

  // /onboarding requires a verified account. Workspace presence is checked
  // by the page itself (graceful empty state otherwise).
  if (pathname.startsWith("/onboarding") && !verified) {
    const url = req.nextUrl.clone();
    url.pathname = "/verify";
    return withAnalytics(NextResponse.redirect(url), analytics);
  }

  // /dashboard requires a verified account. /admin is left untouched —
  // admin accounts are seeded verified.
  if (pathname.startsWith("/dashboard") && !verified) {
    const url = req.nextUrl.clone();
    url.pathname = "/verify";
    return withAnalytics(NextResponse.redirect(url), analytics);
  }

  return withAnalytics(NextResponse.next(), analytics);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

function shouldRewriteSubdomainPath(pathname: string) {
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/api/")) return false;
  // Each store answers robots.txt for itself. Without this exception the ".txt"
  // in PUBLIC_FILE would treat it as a static asset and the store's own rules —
  // keeping cart and checkout out of the index — would never be served.
  if (pathname === "/robots.txt") return true;
  if (PUBLIC_FILE.test(pathname)) return false;

  const segment = firstSegment(pathname);
  if (!segment) return true;

  return !APP_ROUTE_SEGMENTS.has(segment);
}

function canonicalizeSubdomainSitePath(req: NextRequest) {
  const match = req.nextUrl.pathname.match(/^\/site\/([^/]+)(\/.*)?$/);
  if (!match) return null;

  const workspaceSlug = match[1];
  if (!isWorkspaceSlug(workspaceSlug)) return null;

  return redirectToPublicSubdomain(req, workspaceSlug, match[2] ?? "/");
}

function redirectLegacyPublicSiteUrl(req: NextRequest, host: string | null) {
  if (!isPublicRootHost(host)) return null;
  if (PUBLIC_FILE.test(req.nextUrl.pathname)) return null;

  const siteMatch = req.nextUrl.pathname.match(/^\/site\/([^/]+)(\/.*)?$/);
  if (siteMatch?.[1] && isWorkspaceSlug(siteMatch[1])) {
    return redirectToPublicSubdomain(req, siteMatch[1], siteMatch[2] ?? "/");
  }

  const segment = firstSegment(req.nextUrl.pathname);
  if (!segment || APP_ROUTE_SEGMENTS.has(segment) || !isWorkspaceSlug(segment)) {
    return null;
  }

  const rest = req.nextUrl.pathname.slice(segment.length + 1) || "/";
  return redirectToPublicSubdomain(req, segment, rest);
}

function redirectToPublicSubdomain(
  req: NextRequest,
  workspaceSlug: string,
  path: string
) {
  const url = req.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = `${workspaceSlug}.${PUBLIC_SITE_DOMAIN}`;
  url.port = "";
  url.pathname = normalizePublicPath(path) || "/";
  return NextResponse.redirect(url, 308);
}

function firstSegment(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

function isInternalHost(host: string | null): boolean {
  if (!host) return true;
  const h = host.split(":")[0].toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "0.0.0.0";
}

// In-memory cache so the resolve fetch only happens on cold misses per worker.
const customDomainCache = new Map<
  string,
  { slug: string | null; expires: number }
>();
const CUSTOM_DOMAIN_TTL_MS = 30_000;

async function resolveCustomDomainSlug(host: string): Promise<string | null> {
  const key = host.split(":")[0].toLowerCase();
  const now = Date.now();
  const hit = customDomainCache.get(key);
  if (hit && hit.expires > now) return hit.slug;
  try {
    const port = process.env.PORT || "3011";
    const res = await fetch(
      `http://127.0.0.1:${port}/api/resolve-domain?host=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      customDomainCache.set(key, { slug: null, expires: now + CUSTOM_DOMAIN_TTL_MS });
      return null;
    }
    const data = (await res.json()) as { slug?: string | null };
    const slug = data?.slug ?? null;
    customDomainCache.set(key, { slug, expires: now + CUSTOM_DOMAIN_TTL_MS });
    return slug;
  } catch {
    return null;
  }
}

const workspaceSlugCache = new Map<string, { slug: string | null; expires: number }>();

async function resolveWorkspaceSlug(slug: string): Promise<string | null | undefined> {
  const now = Date.now();
  const hit = workspaceSlugCache.get(slug);
  if (hit && hit.expires > now) return hit.slug;
  try {
    const port = process.env.PORT || "3011";
    const res = await fetch(`http://127.0.0.1:${port}/api/resolve-domain?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const data = await res.json() as { slug?: string | null };
    const canonical = data.slug ?? null;
    workspaceSlugCache.set(slug, { slug: canonical, expires: now + CUSTOM_DOMAIN_TTL_MS });
    return canonical;
  } catch {
    return undefined;
  }
}

type AnalyticsCookies = {
  visitorId: string;
  setVisitor: boolean;
  attribution: string | null;
  fbc: string | null;
  ttclid: string | null;
};

/**
 * Mints a first-party visitor id on the first request and records the campaign
 * that brought them, first-touch. Doing this in middleware means it happens
 * before any page renders, so the landing hit itself is attributable.
 */
function resolveAnalyticsCookies(req: NextRequest): AnalyticsCookies {
  const existing = req.cookies.get(VISITOR_COOKIE)?.value;
  const visitorId = existing || crypto.randomUUID();

  const incoming = readAttributionFromUrl(req.nextUrl);
  const stored = decodeAttribution(req.cookies.get(ATTRIBUTION_COOKIE)?.value);
  const merged = mergeAttribution(stored, incoming);

  const clicks = readAdClickCookies(req.nextUrl, {
    fbc: req.cookies.get(FBC_COOKIE)?.value,
    ttclid: req.cookies.get(TTCLID_COOKIE)?.value,
  });

  return {
    visitorId,
    setVisitor: !existing,
    fbc: clicks.fbc,
    ttclid: clicks.ttclid,
    // Only write when it actually changed; re-setting on every request would
    // keep pushing the expiry out and turn a 30-day window into forever.
    attribution:
      hasAttribution(merged) && !hasAttribution(stored)
        ? encodeAttribution(merged)
        : null,
  };
}

function withAnalytics(res: NextResponse, analytics: AnalyticsCookies) {
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
  if (analytics.setVisitor) {
    res.cookies.set(VISITOR_COOKIE, analytics.visitorId, {
      ...base,
      maxAge: VISITOR_COOKIE_MAX_AGE,
    });
  }
  if (analytics.attribution) {
    res.cookies.set(ATTRIBUTION_COOKIE, analytics.attribution, {
      ...base,
      maxAge: ATTRIBUTION_COOKIE_MAX_AGE,
    });
  }
  if (analytics.fbc) {
    res.cookies.set(FBC_COOKIE, analytics.fbc, { ...base, maxAge: FBC_COOKIE_MAX_AGE });
  }
  if (analytics.ttclid) {
    res.cookies.set(TTCLID_COOKIE, analytics.ttclid, {
      ...base,
      maxAge: TTCLID_COOKIE_MAX_AGE,
    });
  }
  return res;
}
