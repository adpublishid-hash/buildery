/**
 * Visitor identity and campaign attribution.
 *
 * Pure and cookie-name-only so both the middleware (which mints the id) and
 * the server actions (which read it) agree without importing each other.
 */

/** First-party, so it survives third-party cookie blocking. */
export const VISITOR_COOKIE = "bd_vid";
/** Campaign parameters, captured once on the landing hit. */
export const ATTRIBUTION_COOKIE = "bd_attr";

/** A year: long enough to credit a slow purchase, short enough to expire. */
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** 30 days, the window most ad platforms use for click attribution. */
export const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * `fb.1.<click time ms>.<fbclid>` — the value Meta's pixel keeps in `_fbc`.
 * Kept separately so a server event can still carry the ad click when an ad
 * blocker stopped the pixel from writing its own cookie.
 */
export const FBC_COOKIE = "bd_fbc";
/** Meta's own `_fbc` lifetime. */
export const FBC_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
/** TikTok click id, for the same reason. */
export const TTCLID_COOKIE = "bd_ttclid";
export const TTCLID_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * The visitor's answer to the cookie banner: "granted" or "denied". Absent
 * means not asked yet. Readable by the banner script, so not httpOnly.
 */
export const CONSENT_COOKIE = "bd_consent";
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export type AdConsent = "granted" | "denied";

export function readConsent(value: string | null | undefined): AdConsent | null {
  return value === "granted" || value === "denied" ? value : null;
}

const CLICK_ID = /^[\w.\-~]{1,500}$/;

/**
 * Cookie values to write for ad click ids in this URL. A new click replaces an
 * older one, as the pixels themselves do; revisiting the same link does not
 * reset the click time.
 */
export function readAdClickCookies(
  url: URL,
  existing: { fbc?: string | null; ttclid?: string | null },
  now = Date.now()
): { fbc: string | null; ttclid: string | null } {
  const fbclid = url.searchParams.get("fbclid")?.trim() ?? "";
  const ttclid = url.searchParams.get("ttclid")?.trim() ?? "";
  return {
    fbc:
      CLICK_ID.test(fbclid) && !existing.fbc?.endsWith(`.${fbclid}`)
        ? `fb.1.${now}.${fbclid}`
        : null,
    ttclid: CLICK_ID.test(ttclid) && existing.ttclid !== ttclid ? ttclid : null,
  };
}

export type Attribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
};

export const EMPTY_ATTRIBUTION: Attribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
};

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 120);
  return trimmed || null;
}

/**
 * Reads campaign parameters off a URL.
 *
 * `gclid`/`fbclid` count as a source too: a click from an ad often arrives
 * with only those, and treating it as direct traffic would credit the sale to
 * nobody.
 */
export function readAttributionFromUrl(url: URL): Attribution {
  const get = (key: string) => clean(url.searchParams.get(key));

  const explicit: Attribution = {
    utmSource: get("utm_source"),
    utmMedium: get("utm_medium"),
    utmCampaign: get("utm_campaign"),
    utmContent: get("utm_content"),
    utmTerm: get("utm_term"),
  };
  if (explicit.utmSource || explicit.utmCampaign) return explicit;

  if (get("gclid")) {
    return { ...explicit, utmSource: "google", utmMedium: explicit.utmMedium ?? "cpc" };
  }
  if (get("fbclid")) {
    return { ...explicit, utmSource: "facebook", utmMedium: explicit.utmMedium ?? "cpc" };
  }
  if (get("ttclid")) {
    return { ...explicit, utmSource: "tiktok", utmMedium: explicit.utmMedium ?? "cpc" };
  }
  return explicit;
}

export function hasAttribution(attribution: Attribution): boolean {
  return Object.values(attribution).some((value) => value !== null);
}

/** Serialises for the cookie. Kept compact — it rides on every request. */
export function encodeAttribution(attribution: Attribution): string {
  return JSON.stringify({
    s: attribution.utmSource,
    m: attribution.utmMedium,
    c: attribution.utmCampaign,
    n: attribution.utmContent,
    t: attribution.utmTerm,
  });
}

export function decodeAttribution(raw: string | undefined): Attribution {
  if (!raw) return EMPTY_ATTRIBUTION;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const pick = (key: string) =>
      typeof parsed[key] === "string" ? clean(parsed[key] as string) : null;
    return {
      utmSource: pick("s"),
      utmMedium: pick("m"),
      utmCampaign: pick("c"),
      utmContent: pick("n"),
      utmTerm: pick("t"),
    };
  } catch {
    return EMPTY_ATTRIBUTION;
  }
}

/**
 * First touch wins: an existing campaign is not overwritten by a later visit.
 * Crediting the last click would hand every sale to whichever retargeting ad
 * happened to be shown most recently.
 */
export function mergeAttribution(
  existing: Attribution,
  incoming: Attribution
): Attribution {
  if (!hasAttribution(incoming)) return existing;
  if (hasAttribution(existing)) return existing;
  return incoming;
}
