import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Package, ShoppingBag } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import type { MetaCustomData } from "@/lib/meta-capi";
import { formatPrice, getCartDetail } from "@/lib/store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StoreHeader } from "@/components/store/store-header";
import { CheckoutForm } from "@/components/store/checkout-form";
import { CouponInput } from "@/components/store/coupon-input";
import { MetaEventTracker } from "@/components/site/meta-event-tracker";
import { issueMetaEventAuthorization } from "@/lib/meta-event-auth";
import { adCurrency, catalogItemId } from "@/lib/ad-catalog";
import { getMemberSession } from "@/lib/member-auth";
import { listCustomerAddresses } from "@/lib/customer-addresses";
import { bundleContents } from "@/lib/bundle-queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Checkout" },
  robots: { index: false },
};

export default async function CheckoutPage({
  params,
}: {
  params: { workspaceSlug: string };
}) {
  const { workspace, lines, subtotal, discount, total, coupon, couponError } =
    await getCartDetail(params.workspaceSlug);
  if (!workspace) notFound();
  if (lines.length === 0) redirect(publicSiteContextHref(workspace.slug, "cart"));
  const setting = workspace.ecommerceSetting;
  const member = await getMemberSession(workspace.slug);
  if (setting?.checkoutRequireLogin) {
    if (!member) {
      const checkoutUrl = publicSiteContextHref(workspace.slug, "checkout");
      redirect(
        `${publicSiteContextHref(workspace.slug, "member/login")}?callbackUrl=${encodeURIComponent(checkoutUrl)}`
      );
    }
  }
  // A returning buyer picks an address instead of retyping it.
  const savedAddresses = member
    ? await listCustomerAddresses(member.customerId)
    : [];
  const manualMethods = await prisma.manualPaymentMethod.findMany({
    where: { workspaceId: workspace.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  // Shipping is required when the cart contains a physical product — including
  // one that arrived inside a bundle, which is not itself PHYSICAL.
  const cartBundles = await bundleContents(
    lines.filter((l) => l.product.type === "BUNDLE").map((l) => l.product.id)
  );
  const bundleShips = (productId: string) =>
    (cartBundles.get(productId) ?? []).some((component) => component.tracksStock);
  const hasPhysical = lines.some(
    (l) =>
      l.product.type === "PHYSICAL" ||
      (l.product.type === "BUNDLE" && bundleShips(l.product.id))
  );
  const totalWeightGrams = lines.reduce(
    (sum, l) =>
      sum + (l.product.type === "PHYSICAL" ? (l.product.weightGrams ?? 0) * l.quantity : 0),
    0
  );
  const shippingEnabled = Boolean(
    hasPhysical && setting?.rajaOngkirApiKey && setting?.shippingOriginCityId
  );
  const hasShippingMethod = Boolean(
    !hasPhysical ||
      shippingEnabled ||
      setting?.flatRateEnabled ||
      setting?.freeShippingEnabled ||
      setting?.pickupEnabled
  );
  const checkoutMetaData: MetaCustomData = {
    content_type: "product",
    content_ids: lines.map(({ product, variant }) => catalogItemId(product.id, variant?.id)),
    contents: lines.map(({ product, variant, quantity, unitPrice }) => ({
      id: catalogItemId(product.id, variant?.id),
      quantity,
      item_price: unitPrice,
    })),
    currency: adCurrency(setting?.currencyCode),
    value: total,
    num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
  const metaAuthorization = issueMetaEventAuthorization({
    workspaceId: workspace.id,
    eventName: "InitiateCheckout",
    customData: checkoutMetaData,
  });

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const checkoutTax = setting?.taxEnabled
    ? setting.pricesIncludeTax
      ? Math.round(((subtotal - discount) * setting.taxRateBps) / (10_000 + setting.taxRateBps))
      : Math.round(((subtotal - discount) * setting.taxRateBps) / 10_000)
    : 0;

  return (
    <div className="min-h-screen bg-zinc-50">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />
      <MetaEventTracker
        workspaceId={workspace.id}
        eventName="InitiateCheckout"
        eventId={metaAuthorization.eventId}
        serverToken={metaAuthorization.token}
        dedupeKey={`checkout:${lines
          .map((line) => `${line.product.id}:${line.quantity}`)
          .join("|")}:${total}`}
        customData={checkoutMetaData}
      />

      <main className="mx-auto max-w-5xl px-6 pb-16 pt-8 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              Checkout
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {itemCount} item • selesaikan pembayaranmu dalam beberapa langkah.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="overflow-hidden border-zinc-200 shadow-sm">
            <CardHeader className="border-b border-zinc-100 bg-white">
              <CardTitle className="text-base">Informasi pesanan</CardTitle>
            </CardHeader>
            <CardContent className="bg-white pt-5">
              {hasShippingMethod ? <CheckoutForm
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                hasPhysical={hasPhysical}
                subtotal={subtotal}
                metaCheckoutData={checkoutMetaData}
                sellerNoteEnabled={
                  workspace.ecommerceSetting?.checkoutSellerNoteEnabled !== false
                }
                shippingEnabled={shippingEnabled}
                flatRateEnabled={setting?.flatRateEnabled}
                flatRateName={setting?.flatRateName}
                flatRateCost={setting?.flatRateCost}
                freeShippingEnabled={setting?.freeShippingEnabled}
                freeShippingMinimum={setting?.freeShippingMinimum}
                pickupEnabled={setting?.pickupEnabled}
                savedAddresses={savedAddresses.map((entry) => ({
                  id: entry.id,
                  label: entry.label,
                  recipientName: entry.recipientName,
                  recipientPhone: entry.recipientPhone,
                  provinceId: entry.provinceId,
                  provinceName: entry.provinceName,
                  cityId: entry.cityId,
                  cityName: entry.cityName,
                  postalCode: entry.postalCode,
                  address: entry.address,
                }))}
                cod={{
                  enabled: Boolean(setting?.codEnabled),
                  fee: setting?.codFee ?? 0,
                  minimum: setting?.codMinimum ?? 0,
                  maximum: setting?.codMaximum ?? null,
                }}
                totalWeightGrams={totalWeightGrams}
                manualMethods={manualMethods.map((method) => ({
                  id: method.id,
                  name: method.name,
                  type: method.type,
                  accountName: method.accountName,
                  accountNumber: method.accountNumber,
                  qrImageUrl: method.qrImageUrl,
                  instructions: method.instructions,
                }))}
              /> : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Toko belum mengaktifkan metode pengiriman untuk produk fisik. Hubungi penjual sebelum melanjutkan checkout.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit overflow-hidden border-zinc-200 shadow-sm lg:sticky lg:top-20">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-zinc-100 bg-white">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4 text-zinc-500" />
                Ringkasan pesanan
              </CardTitle>
              <span className="text-xs font-medium text-zinc-500">
                {itemCount} item
              </span>
            </CardHeader>
            <CardContent className="space-y-4 bg-white pt-4">
              <ul className="space-y-3">
                {lines.map(({ product, variant, quantity, lineTotal }) => (
                  <li
                    key={`${product.id}:${variant?.id ?? "base"}`}
                    className="flex items-start gap-3"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                      {product.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={product.image.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-zinc-300" />
                      )}
                      <span className="sr-only">{product.name}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-zinc-900">
                        {product.name}
                      </p>
                      {variant ? <p className="text-xs text-zinc-600">{variant.name}</p> : null}
                      <p className="text-xs text-zinc-500">Qty {quantity}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-zinc-900">
                      {formatPrice(lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
              {setting?.checkoutCouponEnabled !== false ? (
                <div className="border-t border-zinc-200/70 pt-4">
                  {/* Applying a coupon used to mean going back to the cart.
                      The seller can still switch this off per store. */}
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
                </div>
              ) : null}
              <div className="space-y-1.5 border-t border-zinc-200/70 pt-4 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {coupon && discount > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>
                      Coupon{" "}
                      <span className="font-mono text-[11px]">
                        {coupon.code}
                      </span>
                    </span>
                    <span>− {formatPrice(discount)}</span>
                  </div>
                ) : null}
                {checkoutTax > 0 ? (
                  <div className="flex justify-between text-zinc-600"><span>Pajak{setting?.pricesIncludeTax ? " (termasuk)" : ""}</span><span>{formatPrice(checkoutTax)}</span></div>
                ) : null}
                <div className="flex justify-between border-t border-zinc-200/70 pt-2 text-base font-bold text-zinc-900">
                  <span>Total</span>
                  <span>{formatPrice(total + (setting?.pricesIncludeTax ? 0 : checkoutTax))}</span>
                </div>
                {shippingEnabled ? (
                  <p className="pt-1 text-[11px] text-zinc-400">
                    + Ongkir otomatis ditambahkan setelah kamu pilih alamat &
                    kurir.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
