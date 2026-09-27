import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { effectivePrice, formatPrice, hasDiscount } from "@/lib/store";
import { cn } from "@/lib/utils";
import { StoreImage } from "@/components/store/store-image";
import { variantPriceRange } from "@/lib/product-variants";
import type { StorefrontCard } from "@/lib/storefront-catalog";

type Props = {
  product: StorefrontCard;
  workspaceSlug: string;
};

export function ProductCard({ product, workspaceSlug }: Props) {
  const soldOut = product.type === "PHYSICAL" && product.stock <= 0;
  const discounted = hasDiscount(product);
  const price = effectivePrice(product);
  // A single price is a lie when the S costs 100.000 and the XXL 150.000; the
  // shopper only found out after clicking through.
  const range = variantPriceRange(price, product.variants);
  const savingsPct =
    discounted && product.price > 0
      ? Math.round((1 - price / product.price) * 100)
      : 0;
  const typeLabel = productTypeLabel(product.type);

  return (
    <Link
      href={publicSiteContextHref(workspaceSlug, `products/${product.slug}`)}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-all duration-300",
        "hover:-translate-y-1 hover:border-zinc-300 hover:shadow-[0_18px_50px_-24px_rgba(24,24,27,0.35)]"
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-50">
        {product.imageUrl ? (
          <StoreImage
            src={product.imageUrl}
            alt={product.name}
            // Two per row on a phone, four on a wide grid.
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-9 w-9 text-zinc-300" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {soldOut ? (
            <span className="rounded-md bg-zinc-900/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
              Habis
            </span>
          ) : discounted && savingsPct > 0 ? (
            <span className="rounded-md bg-rose-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
              -{savingsPct}%
            </span>
          ) : null}
          {product.type === "DIGITAL" ? (
            <span className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-700 backdrop-blur">
              Digital
            </span>
          ) : null}
        </div>

        {/* Quick "lihat" hint on hover */}
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex translate-y-2 items-center justify-between rounded-lg bg-zinc-950/85 px-3 py-2 text-xs font-medium text-white opacity-0 backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <span>Lihat produk</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="line-clamp-2 text-sm font-semibold text-zinc-900">
          {product.name}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-zinc-400">
          {typeLabel}
        </p>
        <div className="mt-auto flex items-baseline gap-1.5 pt-2">
          <span className="text-base font-bold tracking-tight text-zinc-900">
            {range.varies
              ? `${formatPrice(range.min)} – ${formatPrice(range.max)}`
              : formatPrice(price)}
          </span>
          {discounted && !range.varies ? (
            <span className="text-xs text-zinc-400 line-through">
              {formatPrice(product.price)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function productTypeLabel(type: string) {
  if (type === "DIGITAL") return "Digital";
  return "Produk fisik";
}
