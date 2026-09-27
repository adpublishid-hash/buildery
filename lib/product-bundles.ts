/**
 * Bundles: one product that is really several.
 *
 * A "beli 3 hemat" package used to be a separate product with its own stock
 * number, which drifted out of step with the products it actually contained —
 * the bundle could sell after its contents had run out. Here a bundle owns no
 * stock at all; what it can sell is derived from what is in it, and buying one
 * reserves each component.
 */

export type BundleComponent = {
  productId: string;
  variantId: string | null;
  /** How many of this component one bundle contains. */
  quantity: number;
  /** Stock of the component (its variant's, when the bundle names one). */
  availableStock: number;
  /** Digital components never run out. */
  tracksStock: boolean;
  name: string;
};

/**
 * How many bundles can be sold: the component that runs out first decides.
 * An empty bundle can sell nothing — it would be an order for nothing.
 */
export function bundleAvailability(components: BundleComponent[]): number {
  if (components.length === 0) return 0;

  let available = Number.POSITIVE_INFINITY;
  for (const component of components) {
    if (!component.tracksStock) continue;
    const perBundle = Math.max(1, component.quantity);
    available = Math.min(available, Math.floor(component.availableStock / perBundle));
  }
  // Every component was digital: nothing limits it.
  return Number.isFinite(available) ? Math.max(0, available) : Number.MAX_SAFE_INTEGER;
}

export type StockLine = {
  productId: string;
  variantId: string | null;
  name: string;
  quantity: number;
};

/**
 * Turns an order's lines into the stock that actually has to move.
 *
 * A bundle contributes its contents, multiplied by how many bundles were
 * bought; anything else contributes itself. Identical component lines coming
 * from different bundles are added together, so two bundles sharing a shirt
 * reserve both shirts at once rather than racing each other.
 */
export function expandBundleLines(
  lines: StockLine[],
  contentsByBundleId: Map<string, BundleComponent[]>
): StockLine[] {
  const merged = new Map<string, StockLine>();

  const add = (line: StockLine) => {
    const key = `${line.productId}:${line.variantId ?? ""}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += line.quantity;
    else merged.set(key, { ...line });
  };

  for (const line of lines) {
    const contents = contentsByBundleId.get(line.productId);
    if (!contents) {
      add(line);
      continue;
    }
    for (const component of contents) {
      if (!component.tracksStock) continue;
      add({
        productId: component.productId,
        variantId: component.variantId,
        name: `${component.name} (dari ${line.name})`,
        quantity: component.quantity * line.quantity,
      });
    }
  }

  return [...merged.values()];
}
