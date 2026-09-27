import "server-only";

import { normalizeEmail, normalizePhone, sha256 } from "@/lib/ad-match";

/**
 * Hashed identity for the browser pixels ("advanced matching").
 *
 * Server events already carry hashed email, phone and external id; the browser
 * pixels did not, so a PageView or AddToCart from the browser could only be
 * matched by cookie. Hashing happens here, on the server, so the raw email and
 * phone never reach the page. Values use the same normalisation as the server
 * events (lib/ad-match.ts), so both copies of an event name the same person.
 */

export type PixelIdentity = {
  /** fbq('init', pixelId, meta) */
  meta: Record<string, string>;
  /** ttq.identify(tiktok) */
  tiktok: Record<string, string>;
  /** gtag('set', 'user_data', google) — enhanced conversions */
  google: Record<string, string>;
};

export function buildPixelIdentity(input: {
  email?: string | null;
  phone?: string | null;
  /** Customer id when signed in, otherwise the first-party visitor id. */
  externalId?: string | null;
}): PixelIdentity {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const emailHash = email ? sha256(email) : null;
  const externalHash = input.externalId ? sha256(input.externalId) : null;

  const identity: PixelIdentity = { meta: {}, tiktok: {}, google: {} };
  if (emailHash) {
    identity.meta.em = emailHash;
    identity.tiktok.email = emailHash;
    identity.google.sha256_email_address = emailHash;
  }
  if (phone) {
    identity.meta.ph = sha256(phone);
    // TikTok and Google hash E.164 with the plus sign.
    identity.tiktok.phone_number = sha256(`+${phone}`);
    identity.google.sha256_phone_number = sha256(`+${phone}`);
  }
  if (externalHash) {
    identity.meta.external_id = externalHash;
    identity.tiktok.external_id = externalHash;
  }
  return identity;
}

/** Only hex digests may be inlined into a script tag. */
export function isSafePixelIdentity(identity: PixelIdentity) {
  return [identity.meta, identity.tiktok, identity.google].every((group) =>
    Object.entries(group).every(
      ([key, value]) => /^[a-z_0-9]+$/.test(key) && /^[a-f0-9]{64}$/.test(value)
    )
  );
}
