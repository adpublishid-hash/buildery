import "server-only";

import { unstable_cache } from "next/cache";

/**
 * A short shared cache for the heavy dashboard aggregates.
 *
 * Every dashboard is `force-dynamic` and ran a dozen aggregate queries on each
 * load, including for a refresh two seconds later. Sixty seconds is short
 * enough that the numbers still feel live and long enough to absorb the
 * reloads that follow one another while someone works.
 *
 * The key must contain every argument that changes the result — workspace and
 * date range — because the cache is shared across users of that workspace.
 */
export function cachedAnalytics<T>(
  key: (string | number)[],
  fn: () => Promise<T>,
  revalidateSeconds = 60
): Promise<T> {
  return unstable_cache(fn, ["analytics", ...key.map(String)], {
    revalidate: revalidateSeconds,
  })();
}

/** Range as cache-key parts. */
export function rangeKey(range: { from: Date; to: Date }) {
  return [range.from.toISOString(), range.to.toISOString()];
}
