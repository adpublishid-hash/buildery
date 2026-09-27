"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  findVariantByOptions,
  effectiveVariantPrice,
  readVariantOptions,
  variantAxisViews,
  type VariantAxis,
} from "@/lib/product-variants";
import { addToCartAction } from "@/lib/actions/cart";
import { useCartDrawer } from "@/components/store/cart-drawer";
import { trackMetaEvent } from "@/lib/meta-client";
import type { MetaCustomData } from "@/lib/meta-capi";
import { cn, formatPrice } from "@/lib/utils";
import { useVariantSelection } from "@/components/store/variant-selection";

type Props = {
  workspaceId: string;
  productId: string;
  basePrice: number;
  variantId?: string | null;
  variants?: {
    id: string;
    name: string;
    price: number | null;
    discountPrice: number | null;
    stock: number;
    options?: unknown;
    imageUrl?: string | null;
  }[];
  /** Option axes, when the product was built as a matrix. */
  axes?: VariantAxis[];
  tracksInventory?: boolean;
  disabled?: boolean;
  withQuantity?: boolean;
  className?: string;
  metaEvent?: {
    customData: MetaCustomData;
  };
};

export function AddToCartButton({
  workspaceId,
  productId,
  basePrice,
  variantId = null,
  variants = [],
  axes = [],
  tracksInventory = true,
  disabled,
  withQuantity,
  className,
  metaEvent,
}: Props) {
  const router = useRouter();
  const cartDrawer = useCartDrawer();
  const [qty, setQty] = useState(1);
  // The gallery sits in another column, so the choice lives in a shared
  // context rather than in this component's own state.
  const {
    selectedId: contextVariantId,
    select: selectVariant,
  } = useVariantSelection();
  const selectedVariantId =
    contextVariantId ??
    variantId ??
    variants.find((variant) => !tracksInventory || variant.stock > 0)?.id ??
    variants[0]?.id ??
    null;
  const setSelectedVariantId = selectVariant;
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const res = await addToCartAction(
        workspaceId,
        productId,
        qty,
        selectedVariantId
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (metaEvent) {
        trackMetaEvent({
          workspaceId,
          eventName: "AddToCart",
          eventId: res.adEventId,
          customData: {
            ...res.adCustomData,
            // The page knows the store's currency; the action does not look it up.
            currency: metaEvent.customData.currency ?? res.adCustomData.currency,
            content_category: metaEvent.customData.content_category,
          },
          // The server action already queued the server copy under this id.
          sendServer: false,
        });
      }
      router.refresh();
      // Slide-in the offcanvas drawer with the updated cart. The drawer
      // refetches the snapshot itself, so this works even before the
      // server-rendered layout re-renders.
      cartDrawer.open();
    });
  }

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
  const selectedRegularPrice = selectedVariant?.price ?? basePrice;
  const selectedPrice = selectedVariant
    ? effectiveVariantPrice(basePrice, selectedVariant)
    : basePrice;
  const soldOut = disabled || (tracksInventory && selectedVariant ? selectedVariant.stock <= 0 : false);

  if (disabled && variants.length === 0) {
    return (
      <Button disabled className={className} variant="secondary">
        Sold out
      </Button>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {axes.length > 0 ? (
        <AxisPickers
          axes={axes}
          variants={variants}
          tracksInventory={tracksInventory}
          selectedVariantId={selectedVariantId}
          onSelect={(id) => {
            setSelectedVariantId(id);
            setQty(1);
          }}
        />
      ) : variants.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-700">Pilih varian</p>
          <div className="grid grid-cols-2 gap-2">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                disabled={tracksInventory && variant.stock <= 0}
                onClick={() => { setSelectedVariantId(variant.id); setQty(1); }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45",
                  selectedVariantId === variant.id
                    ? "border-zinc-950 ring-1 ring-zinc-950"
                    : "border-zinc-200"
                )}
              >
                <span className="block font-medium">{variant.name}</span>
                <span className="text-xs text-zinc-500">
                  {variant.discountPrice != null && variant.discountPrice > 0 && variant.discountPrice < (variant.price ?? basePrice) ? (
                    <><span className="font-medium text-zinc-900">{formatPrice(variant.discountPrice)}</span>{" "}<span className="line-through">{formatPrice(variant.price ?? basePrice)}</span></>
                  ) : variant.price != null ? formatPrice(variant.price) : "Harga utama"}
                  {tracksInventory ? ` · Stok ${variant.stock}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {selectedVariant ? (
        <div className="flex items-baseline gap-2" aria-live="polite">
          <span className="text-lg font-semibold text-zinc-900">{formatPrice(selectedPrice)}</span>
          {selectedPrice < selectedRegularPrice ? (
            <span className="text-sm text-zinc-400 line-through">{formatPrice(selectedRegularPrice)}</span>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
      {withQuantity ? (
        <div className="flex h-9 items-center rounded-lg border border-zinc-200">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-full w-9 items-center justify-center text-zinc-500 hover:text-zinc-900"
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center text-sm font-medium text-zinc-900">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(tracksInventory ? (selectedVariant?.stock ?? 99) : 99, q + 1))}
            className="flex h-full w-9 items-center justify-center text-zinc-500 hover:text-zinc-900"
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <Button onClick={add} disabled={pending || soldOut || (variants.length > 0 && !selectedVariant)} className="flex-1">
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <ShoppingCart />
        )}
        {soldOut ? "Sold out" : "Add to cart"}
      </Button>
      </div>
    </div>
  );
}

/**
 * One selector per option axis, the way a shopper expects to buy: pick a
 * colour, then a size. A value is greyed out when nothing in stock still
 * matches it alongside the choices already made — so the shopper cannot
 * assemble a combination that does not exist.
 */
function AxisPickers({
  axes,
  variants,
  tracksInventory,
  selectedVariantId,
  onSelect,
}: {
  axes: VariantAxis[];
  variants: { id: string; stock: number; options?: unknown; imageUrl?: string | null }[];
  tracksInventory: boolean;
  selectedVariantId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const parsed = variants.map((variant) => ({
    ...variant,
    values: readVariantOptions(variant.options as never),
  }));
  const selected = parsed.find((variant) => variant.id === selectedVariantId);
  const selection = selected?.values ?? {};
  // Where the variants carry their own photos, the colour row becomes swatches.
  const views = variantAxisViews(
    axes,
    variants.map((variant) => ({
      id: variant.id,
      stock: tracksInventory ? variant.stock : 1,
      options: (variant.options ?? {}) as never,
      imageUrl: variant.imageUrl,
    }))
  );
  // A swatch whose photo 404s would be an unlabelled empty box, and the shopper
  // could not tell the colours apart at all.
  const [brokenImages, setBrokenImages] = useState<string[]>([]);
  const markBroken = (url: string) =>
    setBrokenImages((current) =>
      current.includes(url) ? current : [...current, url]
    );
  const imagesByAxis = new Map(
    views.map((view) => [
      view.name,
      new Map(view.values.map((entry) => [entry.value, entry.imageUrl])),
    ])
  );

  function choose(axisName: string, value: string) {
    const next = { ...selection, [axisName]: value };
    const exact = findVariantByOptions(
      parsed.map((variant) => ({ ...variant, options: variant.values })),
      next
    );
    if (exact) {
      onSelect(exact.id);
      return;
    }
    // The other axes no longer fit: keep this choice and take the first
    // in-stock variant that honours it, rather than leaving nothing selected.
    const fallback =
      parsed.find((variant) => variant.values[axisName] === value && (!tracksInventory || variant.stock > 0)) ??
      parsed.find((variant) => variant.values[axisName] === value);
    onSelect(fallback?.id ?? null);
  }

  return (
    <div className="space-y-3">
      {axes.map((axis) => (
        <div key={axis.name} className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-700">{axis.name}</p>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((value) => {
              const available = parsed.some(
                (variant) =>
                  variant.values[axis.name] === value &&
                  (!tracksInventory || variant.stock > 0) &&
                  Object.entries(selection).every(
                    ([otherAxis, otherValue]) =>
                      otherAxis === axis.name ||
                      variant.values[otherAxis] === otherValue
                  )
              );
              const isSelected = selection[axis.name] === value;
              const candidate = imagesByAxis.get(axis.name)?.get(value) ?? null;
              const swatch =
                candidate && !brokenImages.includes(candidate) ? candidate : null;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${axis.name}: ${value}`}
                  title={value}
                  disabled={!available && !isSelected}
                  onClick={() => choose(axis.name, value)}
                  className={cn(
                    "rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40",
                    swatch ? "overflow-hidden p-0.5" : "px-3 py-1.5 text-sm",
                    isSelected
                      ? "border-zinc-950 ring-1 ring-zinc-950"
                      : "border-zinc-200 hover:border-zinc-400"
                  )}
                >
                  {swatch ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={swatch}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      // The server-rendered image can fail before React ever
                      // attaches onError, so the state is also checked once the
                      // element is on the page.
                      ref={(node) => {
                        if (node?.complete && node.naturalWidth === 0) {
                          markBroken(swatch);
                        }
                      }}
                      onError={() => markBroken(swatch)}
                      className="h-11 w-11 rounded-md object-cover"
                    />
                  ) : (
                    value
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
