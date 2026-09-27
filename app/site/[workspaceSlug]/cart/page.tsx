import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Package, ShoppingCart } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { formatPrice, getCartDetail } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { StoreHeader } from "@/components/store/store-header";
import { CartLineControl } from "@/components/store/cart-line-control";
import { CouponInput } from "@/components/store/coupon-input";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: { absolute: "Cart" }, robots: { index: false } };
}

export default async function CartPage({
  params,
}: {
  params: { workspaceSlug: string };
}) {
  const { workspace, lines, subtotal, discount, total, coupon, couponError } =
    await getCartDetail(params.workspaceSlug);
  if (!workspace) notFound();

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Your cart
        </h1>

        {lines.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
              <ShoppingCart className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-900">
              Your cart is empty
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Browse the store and add a few products.
            </p>
            <Button asChild className="mt-5">
              <Link href={publicSiteContextHref(workspace.slug, "products")}>
                Browse products
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="mt-6 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {lines.map(({ product, variant, quantity, unitPrice, lineTotal }) => (
                <li key={`${product.id}:${variant?.id ?? "base"}`} className="flex items-center gap-4 p-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                    {product.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img loading="lazy" decoding="async"
                        src={product.image.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-5 w-5 text-zinc-300" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={publicSiteContextHref(
                        workspace.slug,
                        `products/${product.slug}`
                      )}
                      className="block truncate text-sm font-medium text-zinc-900 hover:underline"
                    >
                      {product.name}
                    </Link>
                    {variant ? <p className="text-xs font-medium text-zinc-600">{variant.name}</p> : null}
                    <p className="text-xs text-zinc-500">
                      {formatPrice(unitPrice)} each
                    </p>
                    <div className="mt-2">
                      <CartLineControl
                        productId={product.id}
                        variantId={variant?.id}
                        quantity={quantity}
                        max={
                          product.type === "PHYSICAL"
                            ? Math.max(variant?.stock ?? product.stock, 1)
                            : 99
                        }
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-zinc-900">
                    {formatPrice(lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
              {workspace.ecommerceSetting?.checkoutCouponEnabled !== false ? (
                <CouponInput
                  {...(coupon
                    ? {
                        applied: {
                          code: coupon.code,
                          label:
                            coupon.type === "PERCENTAGE"
                              ? `${coupon.value}% off - saving ${formatPrice(discount)}`
                              : `${formatPrice(coupon.value)} off`,
                        },
                      }
                    : { applied: null, serverError: couponError })}
                />
              ) : null}

              <div className="space-y-1.5 border-t border-zinc-200/70 pt-3 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discount > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span>− {formatPrice(discount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-zinc-200/70 pt-2 text-base font-semibold text-zinc-900">
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button asChild>
                <Link href={publicSiteContextHref(workspace.slug, "checkout")}>
                  Proceed to checkout
                </Link>
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
