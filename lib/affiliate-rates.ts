// Pure affiliate commission-rate rules, shared by the commission engine and
// the dashboard (which shows the effective rate before any sale happens).

export const MAX_COMMISSION_PERCENT = 100;

/**
 * Which rate applies to a sale, most specific first:
 *
 * 1. the partner's negotiated rate (a deal with that person covers everything),
 * 2. the rate set on the product, course, or membership plan sold,
 * 3. the program default.
 *
 * Rates are basis points (1% = 100) so blended order rates keep precision.
 */
export function resolveCommissionRateBps(input: {
  affiliatePercent: number | null | undefined;
  itemRateBps: number | null | undefined;
  programPercent: number;
}) {
  if (input.affiliatePercent != null) return clampBps(input.affiliatePercent * 100);
  if (input.itemRateBps != null) return clampBps(input.itemRateBps);
  return clampBps(input.programPercent * 100);
}

/**
 * One rate for an order whose lines carry different product rates: each line's
 * rate weighted by what the line earns (price × quantity). Lines without their
 * own rate count at the program default. Returns null when no line overrides
 * the default, so the caller can fall through to the program rate.
 */
export function blendedRateBps(
  lines: { amount: number; percent: number | null | undefined }[],
  programPercent: number
): number | null {
  const priced = lines.filter((line) => line.amount > 0);
  if (!priced.some((line) => line.percent != null)) return null;
  const total = priced.reduce((sum, line) => sum + line.amount, 0);
  if (total <= 0) return null;
  const weighted = priced.reduce(
    (sum, line) => sum + line.amount * (line.percent ?? programPercent) * 100,
    0
  );
  return clampBps(Math.round(weighted / total));
}

export function percentToBps(percent: number | null | undefined) {
  return percent == null ? null : clampBps(percent * 100);
}

export function commissionAmount(basisAmount: number, rateBps: number) {
  return Math.floor((Math.max(0, Math.floor(basisAmount)) * rateBps) / 10_000);
}

/** Parses a percent typed into a form: blank means "use the default". */
export function parseOptionalPercent(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, value: null };
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > MAX_COMMISSION_PERCENT) return { ok: false };
  return { ok: true, value };
}

function clampBps(value: number) {
  return Math.min(MAX_COMMISSION_PERCENT * 100, Math.max(0, Math.round(value)));
}
