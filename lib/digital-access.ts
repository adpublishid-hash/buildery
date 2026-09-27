import type { Prisma } from "@prisma/client";

export type DigitalAccessItem = {
  label: string;
  url: string;
};

export type DigitalAccessProduct = {
  downloadLabel?: string | null;
  downloadUrl?: string | null;
  digitalAccessItems?: Prisma.JsonValue | null;
};

export function normalizeDigitalAccessItems(
  product: DigitalAccessProduct | null | undefined
): DigitalAccessItem[] {
  if (!product) return [];

  const items = Array.isArray(product.digitalAccessItems)
    ? product.digitalAccessItems
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => {
          const record = item as Record<string, unknown>;
          return {
            label:
              typeof record.label === "string" && record.label.trim()
                ? record.label.trim()
                : "Akses produk",
            url: typeof record.url === "string" ? record.url.trim() : "",
          };
        })
        .filter((item) => item.url)
    : [];

  if (items.length > 0) return items;

  return product.downloadUrl
    ? [
        {
          label: product.downloadLabel || "Download file",
          url: product.downloadUrl,
        },
      ]
    : [];
}
