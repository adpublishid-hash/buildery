const DEFAULT_PUBLIC_SITE_DOMAIN = "landing.my.id";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const PUBLIC_SITE_DOMAIN = normalizeDomain(
  process.env.NEXT_PUBLIC_SITE_DOMAIN ||
    process.env.PUBLIC_SITE_DOMAIN ||
    DEFAULT_PUBLIC_SITE_DOMAIN
);

export const RESERVED_PUBLIC_SUBDOMAINS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "cdn",
  "ftp",
  "imap",
  "localhost",
  "mail",
  "pop",
  "smtp",
  "static",
  "www",
]);

export function normalizeDomain(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function normalizeHost(host: string | null) {
  if (!host) return "";
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");

  if (normalized.startsWith("[")) {
    return normalized.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1");
  }

  return normalized.replace(/:\d+$/, "");
}

export function isWorkspaceSlug(value: string) {
  return SLUG_RE.test(value) && !RESERVED_PUBLIC_SUBDOMAINS.has(value);
}

export function getPublicWorkspaceSlugFromHost(
  host: string | null,
  domain = PUBLIC_SITE_DOMAIN
) {
  const normalizedHost = normalizeHost(host);
  const normalizedDomain = normalizeDomain(domain);
  const suffix = `.${normalizedDomain}`;

  if (!normalizedHost.endsWith(suffix)) return null;

  const subdomain = normalizedHost.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return null;
  if (!isWorkspaceSlug(subdomain)) return null;

  return subdomain;
}

export function isPublicRootHost(host: string | null, domain = PUBLIC_SITE_DOMAIN) {
  const normalizedHost = normalizeHost(host);
  const normalizedDomain = normalizeDomain(domain);

  return (
    normalizedHost === normalizedDomain ||
    normalizedHost === `www.${normalizedDomain}`
  );
}

export function normalizePublicPath(path = "") {
  const clean = path.trim();
  if (!clean || clean === "/") return "";
  return `/${clean.replace(/^\/+/, "")}`;
}

export function publicSiteRoutePath(workspaceSlug: string, path = "") {
  return `/site/${workspaceSlug}${normalizePublicPath(path)}`;
}

export function publicSiteUrl(workspaceSlug: string, path = "") {
  return `https://${workspaceSlug}.${PUBLIC_SITE_DOMAIN}${normalizePublicPath(path)}`;
}

export function publicSiteDisplayUrl(workspaceSlug: string, path = "") {
  return `${workspaceSlug}.${PUBLIC_SITE_DOMAIN}${normalizePublicPath(path)}`;
}

export function publicSiteHref(workspaceSlug: string, path = "") {
  if (isLocalAppUrl(process.env.NEXT_PUBLIC_APP_URL)) {
    return publicSiteRoutePath(workspaceSlug, path);
  }

  return publicSiteUrl(workspaceSlug, path);
}

function isLocalAppUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
