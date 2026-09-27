import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guard for URLs the server will fetch on a user's behalf.
 *
 * A form's webhook URL is typed by anyone with `content.edit` — which
 * includes EDITOR — and the server then fetches it. Without this, that field
 * is a request forgery primitive: an editor could point it at the cloud
 * metadata endpoint or at a port on the VPS's private network and read the
 * outcome off the delivery's error message.
 *
 * Resolution happens at send time, not just at save time: a hostname that
 * resolved publicly when the form was saved can be repointed at 127.0.0.1
 * later (DNS rebinding), so the check has to run against the address we are
 * actually about to talk to.
 */

export type OutboundUrlCheck =
  | { ok: true; url: URL }
  | { ok: false; error: string };

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  // Cloud instance metadata, by name as well as by address.
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

/** Syntax-only check, cheap enough to run when a form is saved. */
export function parsePublicHttpUrl(raw: string): OutboundUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "URL tidak valid." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "URL harus memakai http:// atau https://." };
  }
  // Credentials in the URL are a redirect-laundering trick and serve no
  // purpose for a webhook.
  if (url.username || url.password) {
    return { ok: false, error: "URL tidak boleh memuat username atau password." };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    return { ok: false, error: "URL tidak boleh mengarah ke host lokal." };
  }
  // A literal private address needs no DNS round trip to reject.
  if (isIP(host) && isPrivateAddress(host)) {
    return { ok: false, error: "URL tidak boleh mengarah ke alamat jaringan privat." };
  }

  return { ok: true, url };
}

/**
 * Full check: syntax, then every address the hostname currently resolves to.
 * Run this immediately before the request.
 */
export async function assertPublicHttpUrl(
  raw: string
): Promise<OutboundUrlCheck> {
  const parsed = parsePublicHttpUrl(raw);
  if (!parsed.ok) return parsed;

  const host = parsed.url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host)) return parsed;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, error: "Host webhook tidak bisa di-resolve." };
  }
  if (addresses.length === 0) {
    return { ok: false, error: "Host webhook tidak bisa di-resolve." };
  }
  // Every answer must be public: one private address in a round-robin is
  // enough for an attacker to eventually land on it.
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    return { ok: false, error: "URL tidak boleh mengarah ke alamat jaringan privat." };
  }

  return parsed;
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  // Not an address at all — treat as unsafe rather than guessing.
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;

  // IPv4-mapped (::ffff:10.0.0.1) inherits the IPv4 verdict.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  const head = normalized.split(":")[0];
  if (!head) return true;
  const block = Number.parseInt(head.padEnd(4, "0"), 16);
  if (Number.isNaN(block)) return true;

  if ((block & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((block & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((block & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}
