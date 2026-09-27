// Date-range parsing for the analytics dashboard. Pure utility — safe to
// import from both server and client code.

export type RangeKey = "today" | "7d" | "30d" | "custom";

export type AnalyticsRange = {
  key: RangeKey;
  from: Date;
  to: Date;
  /** Inclusive day count, e.g. "today" = 1, "7d" = 7. */
  days: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function parseDateInput(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolves search params into a date range. Defaults to the last 7 days.
 * `custom` falls back to `7d` when from/to are missing or inverted.
 */
export function resolveRange(params: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}): AnalyticsRange {
  const now = new Date();
  const todayEnd = endOfDay(now);

  if (params.range === "today") {
    return {
      key: "today",
      from: startOfDay(now),
      to: todayEnd,
      days: 1,
    };
  }
  if (params.range === "30d") {
    const from = startOfDay(new Date(now.getTime() - 29 * DAY_MS));
    return { key: "30d", from, to: todayEnd, days: 30 };
  }
  if (params.range === "custom") {
    const from = parseDateInput(params.from);
    const to = parseDateInput(params.to);
    if (from && to && from <= to) {
      const f = startOfDay(from);
      const t = endOfDay(to);
      const days = Math.floor((t.getTime() - f.getTime()) / DAY_MS) + 1;
      return { key: "custom", from: f, to: t, days };
    }
    // fall through to the default
  }
  // default "7d"
  const from = startOfDay(new Date(now.getTime() - 6 * DAY_MS));
  return { key: "7d", from, to: todayEnd, days: 7 };
}

/**
 * Inclusive list of yyyy-mm-dd date keys between `from` and `to` (local
 * time). Used to align chart series with empty days.
 */
export function eachDayKey(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const start = startOfDay(from);
  const end = startOfDay(to);
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    keys.push(formatDayKey(new Date(t)));
  }
  return keys;
}

export function formatDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Short label for the chart x-axis ("May 16"). */
export function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    month: "short",
    day: "numeric",
  });
}

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Hari ini",
  "7d": "7 hari terakhir",
  "30d": "30 hari terakhir",
  custom: "Kustom",
};
