import { createHash } from "node:crypto";

/**
 * Normalisation for the customer fields ad platforms use to match a server
 * event to a person (Meta "Event Match Quality", TikTok "match rate").
 *
 * A hash only matches when both sides normalise identically, so these rules
 * follow the platforms' specs rather than what looks tidy. Pure functions, no
 * I/O, so they are covered by unit tests.
 */

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return email.includes("@") ? email : null;
}

/**
 * Digits only, with a country code. Stores on this platform sell in Indonesia,
 * where buyers type local numbers ("0812…", "812…"). Hashed as typed, those
 * never match the "62812…" the platforms hold, so a local number is given the
 * Indonesian country code. Numbers already carrying one are left alone.
 */
export function normalizePhone(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("+")) {
    // Already international.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `62${digits.slice(1)}`;
  } else if (digits.startsWith("8") && digits.length >= 9 && digits.length <= 12) {
    digits = `62${digits}`;
  }

  return digits.length >= 6 && digits.length <= 15 ? digits : null;
}

export function normalizeName(value: string | null | undefined) {
  const name = value?.trim().toLowerCase() ?? "";
  return name || null;
}

/** Meta `ct`: lowercase letters only, e.g. "Kota Bandung" → "bandung". */
export function normalizeCity(value: string | null | undefined) {
  if (!value) return null;
  const city = value
    .toLowerCase()
    .replace(/^(kota|kabupaten|kab\.?)\s+/, "")
    .replace(/[^a-z]/g, "");
  return city || null;
}

/** Postal code: lowercase, no spaces or dashes. */
export function normalizePostalCode(value: string | null | undefined) {
  const zip = value?.toLowerCase().replace(/[\s-]/g, "") ?? "";
  return zip || null;
}

/** ISO 3166-1 alpha-2, lowercase. */
export function normalizeCountry(value: string | null | undefined) {
  const country = value?.trim().toLowerCase() ?? "";
  return /^[a-z]{2}$/.test(country) ? country : null;
}

export function splitName(name: string | null | undefined) {
  if (!name) return {};
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

/** Accepts only a well-formed `_fbc` / `_fbp` cookie value. */
export function validFacebookCookie(value: string | null | undefined) {
  return value && /^fb\.\d\.\d+\.\S{1,500}$/.test(value) ? value : null;
}

export function validClickId(value: string | null | undefined) {
  const id = value?.trim();
  return id && id.length <= 500 && /^[\w.\-~]+$/.test(id) ? id : null;
}
