// Shared (client + server safe) helpers for custom-domain input.

/** Public IP a custom domain should point at (override per deploy via env). */
export const CUSTOM_DOMAIN_TARGET_IP =
  process.env.CUSTOM_DOMAIN_TARGET_IP || "164.152.166.238";

const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Strip protocol, path, query, port, www-noise and lowercase. */
export function normalizeDomain(input: string): string {
  let s = (input || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  s = s.replace(/\.+$/, "");
  return s;
}

export function isValidDomain(domain: string): boolean {
  return domain.length > 0 && domain.length <= 253 && DOMAIN_RE.test(domain);
}

/** True for the platform's own domain or any of its subdomains. */
export function isPlatformDomain(domain: string, platform: string): boolean {
  const d = domain.toLowerCase();
  const p = platform.toLowerCase();
  return d === p || d.endsWith(`.${p}`);
}

/** True when the domain has no subdomain part (example.com). */
export function isApexDomain(domain: string): boolean {
  return domain.split(".").length === 2;
}

/** DNS "host"/name to enter for this domain ("@" for apex, else the label). */
export function dnsHostLabel(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return "@";
  return parts.slice(0, parts.length - 2).join(".");
}
