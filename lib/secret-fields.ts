/**
 * Credentials a workspace stores for third-party services.
 *
 * The rule these helpers enforce: a stored secret never travels back to the
 * browser. Settings pages send only a hint that one exists ("••••1234"); the
 * form leaves the input empty; and an empty submission means "keep what is
 * stored". A secret is replaced by typing a new one, and removed only through
 * an explicit clear flag — never by accident because a field came back blank.
 *
 * Client-safe: no server imports.
 */

/** Suffix of the form field that asks for a stored secret to be deleted. */
export const CLEAR_SECRET_SUFFIX = "__clear";

/** Shows that a secret is stored without revealing it. */
export function secretHint(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // Short secrets would be mostly revealed by a four-character tail.
  const tail = trimmed.length >= 12 ? trimmed.slice(-4) : "";
  return `••••${tail}`;
}

/**
 * Resolves what to write for one secret field.
 *
 * - `undefined` → leave the column untouched
 * - `null`      → clear the stored value
 * - a string    → replace it
 */
export function resolveSecretUpdate(
  submitted: FormDataEntryValue | null | undefined,
  clearFlag: FormDataEntryValue | null | undefined
): string | null | undefined {
  if (String(clearFlag ?? "") === "true") return null;
  const value = String(submitted ?? "").trim();
  return value ? value : undefined;
}

/** EcommerceSetting columns that hold credentials. */
export const ECOMMERCE_SECRET_FIELDS = [
  "midtransServerKey",
  "midtransClientKey",
  "rajaOngkirApiKey",
  "shippingAggregatorApiKey",
] as const;

export type EcommerceSecretField = (typeof ECOMMERCE_SECRET_FIELDS)[number];

/**
 * Splits a settings row into what may reach the browser and a hint for each
 * credential. Call it on the server, before handing the row to a client form.
 */
export function withoutEcommerceSecrets<T extends Record<EcommerceSecretField, string | null>>(
  setting: T
): {
  publicSetting: Omit<T, EcommerceSecretField>;
  hints: Record<EcommerceSecretField, string | null>;
} {
  const publicSetting = { ...setting } as Partial<T>;
  const hints = {} as Record<EcommerceSecretField, string | null>;
  for (const field of ECOMMERCE_SECRET_FIELDS) {
    hints[field] = secretHint(setting[field]);
    delete publicSetting[field];
  }
  return { publicSetting: publicSetting as Omit<T, EcommerceSecretField>, hints };
}
