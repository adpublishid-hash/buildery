import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  Truck,
  Zap,
} from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import type { MetaCustomData } from "@/lib/meta-capi";
import { catalogContentType, catalogItemId } from "@/lib/ad-catalog";
import { getWorkspaceAdCurrency } from "@/lib/ad-events";
import {
  effectivePrice,
  formatPrice,
  getStoreWorkspace,
  hasDiscount,
} from "@/lib/store";
import { resolveContent } from "@/lib/storefront-content";
import { getPageContent } from "@/lib/storefront-content-server";
import { Badge } from "@/components/ui/badge";
import { StoreHeader } from "@/components/store/store-header";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { ProductGallery } from "@/components/store/product-gallery";
import { VariantSelectionProvider } from "@/components/store/variant-selection";
import { readVariantAxes, variantPriceRange } from "@/lib/product-variants";
import { relatedStorefrontProducts } from "@/lib/storefront-catalog";
import { bundleStock } from "@/lib/bundle-queries";
import { StockWatchForm } from "@/components/store/stock-watch-form";
import { ConversionTracker } from "@/components/site/conversion-tracker";
import { MetaEventTracker } from "@/components/site/meta-event-tracker";
import { issueMetaEventAuthorization } from "@/lib/meta-event-auth";
import { getMemberSession } from "@/lib/member-auth";
import { ProductEngagement } from "@/components/store/product-engagement";
import { ProductCard } from "@/components/store/product-card";
import { RecentlyViewedProducts } from "@/components/store/recently-viewed-products";

export const dynamic = "force-dynamic";

type Params = { workspaceSlug: string; productSlug: string };

async function loadProduct(params: Params) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return null;
  const product = await prisma.product.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: params.productSlug,
      },
    },
    include: {
      image: true,
      category: true,
      membershipPlans: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          level: true,
          accessDays: true,
        },
        orderBy: [{ level: "asc" }, { createdAt: "asc" }],
      },
      variants: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      reviews: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!product || product.status !== "ACTIVE") return null;
  const gallery = product.galleryImageIds.length
    ? await prisma.uploadFile.findMany({
        where: { id: { in: product.galleryImageIds }, workspaceId: workspace.id },
      })
    : [];
  return { workspace, product, gallery };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const result = await loadProduct(params);
  if (!result) return { title: "Product not found" };
  return {
    title: {
      absolute:
        result.product.metaTitle ||
        `${result.product.name} · ${result.workspace.name}`,
    },
    description:
      result.product.metaDescription ||
      result.product.description?.slice(0, 160) ||
      undefined,
  };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: { variant?: string };
}) {
  const result = await loadProduct(params);
  if (!result) notFound();
  const { workspace, product, gallery } = result;
  const member = await getMemberSession(workspace.slug);
  const [wishlist, reviewItem, relatedProducts, ratingSummary] = await Promise.all([
    member
      ? prisma.wishlistItem.findUnique({ where: { customerId_productId: { customerId: member.customerId, productId: product.id } } })
      : null,
    member
      ? prisma.orderItem.findFirst({ where: { productId: product.id, review: null, order: { customerId: member.customerId, status: { in: ["PAID", "PROCESSING", "COMPLETED"] } } }, orderBy: { order: { createdAt: "desc" } }, select: { id: true } })
      : null,
    relatedStorefrontProducts({
      workspaceId: workspace.id,
      productId: product.id,
      categoryId: product.categoryId,
    }),
    // Every published review, not just the page of them rendered below: the
    // rating shown to shoppers and handed to Google was the average of the 20
    // newest, and claimed that was the whole count.
    prisma.productReview.aggregate({
      where: { productId: product.id, status: "PUBLISHED" },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  // Variant photos, resolved here so the provider only ships URLs. The editor
  // stores a plain URL; imageId is the older upload-backed field, kept as a
  // fallback for products created before that changed.
  const variantImages = await prisma.uploadFile.findMany({
    where: {
      id: {
        in: product.variants
          .map((variant) => variant.imageId)
          .filter((id): id is string => Boolean(id)),
      },
    },
    select: { id: true, url: true },
  });
  const variantImageUrlById = new Map(variantImages.map((i) => [i.id, i.url]));
  const imageByVariantId = Object.fromEntries(
    product.variants.map((variant) => [
      variant.id,
      variant.imageUrl?.trim() ||
        (variant.imageId ? (variantImageUrlById.get(variant.imageId) ?? null) : null),
    ])
  );
  // Choosing from a list of one is friction with no purpose.
  const sellableVariants = product.variants.filter(
    (variant) => product.type !== "PHYSICAL" || variant.stock > 0
  );
  // A catalog ad links to one variant (`?variant=`); land on it when it can
  // still be bought, otherwise fall back to the only sellable one.
  const requestedVariant = sellableVariants.find(
    (variant) => variant.id === searchParams?.variant
  );
  const preselectedVariantId =
    requestedVariant?.id ??
    (sellableVariants.length === 1 ? sellableVariants[0].id : null);

  // A bundle keeps no stock of its own: what it contains decides.
  const bundleAvailable =
    product.type === "BUNDLE"
      ? ((await bundleStock([product.id])).get(product.id) ?? 0)
      : null;
  const soldOut =
    bundleAvailable !== null
      ? bundleAvailable <= 0
      : product.type === "PHYSICAL" &&
        (product.variants.length > 0
          ? product.variants.every((variant) => variant.stock <= 0)
          : product.stock <= 0);
  const discounted = hasDiscount(product);
  const linkedMembershipPlans = product.membershipPlans;
  const productPrice = effectivePrice(product);
  // With variants at different prices, one number understates or overstates the
  // product until the shopper picks; show what the range actually is.
  const priceRange = variantPriceRange(productPrice, product.variants);
  const advertisedPrice = priceRange.min;
  const savingsPct =
    discounted && product.price > 0
      ? Math.round((1 - productPrice / product.price) * 100)
      : 0;
  const galleryImages = [
    ...(product.image ? [{ id: product.image.id, url: product.image.url }] : []),
    ...gallery.map((g) => ({ id: g.id, url: g.url })),
  ];
  const productCategory = product.category?.name ?? productTypeLabel(product.type);
  const adCurrencyCode = await getWorkspaceAdCurrency(workspace.id);
  // Ids match the catalog feed: a product with variants is its item group.
  const productMetaData: MetaCustomData = {
    content_ids: [catalogItemId(product.id)],
    content_name: product.name,
    content_type: catalogContentType(product.variants.length > 0),
    content_category: productCategory,
    contents: [{ id: catalogItemId(product.id), quantity: 1, item_price: advertisedPrice }],
    currency: adCurrencyCode,
    value: advertisedPrice,
  };
  const metaAuthorization = issueMetaEventAuthorization({
    workspaceId: workspace.id,
    eventName: "ViewContent",
    customData: productMetaData,
  });
  const content = resolveContent(
    "products_single",
    await getPageContent(workspace.id, "products_single"),
    {
      descriptionHeading: "Deskripsi",
      detailsHeading: "Product details",
      checkoutNote: "Checkout cepat dengan notifikasi email dan WhatsApp.",
    }
  );
  const reviewCount = ratingSummary._count._all;
  const averageRating = ratingSummary._avg.rating ?? 0;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: galleryImages.map((image) => image.url),
    sku: product.sku || undefined,
    offers: priceRange.varies
      ? { "@type": "AggregateOffer", priceCurrency: adCurrencyCode, lowPrice: priceRange.min, highPrice: priceRange.max, offerCount: product.variants.length }
      : { "@type": "Offer", priceCurrency: adCurrencyCode, price: priceRange.min, availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" },
    ...(reviewCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: averageRating.toFixed(1), reviewCount } } : {}),
  };

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />
      <MetaEventTracker
        workspaceId={workspace.id}
        eventName="ViewContent"
        eventId={metaAuthorization.eventId}
        serverToken={metaAuthorization.token}
        dedupeKey={`product:${product.id}`}
        customData={productMetaData}
      />
      {/* First-party funnel step. Separate from the Meta pixel above so the
          store keeps its own numbers when a blocker stops the pixel. */}
      <ConversionTracker
        workspaceId={workspace.id}
        type="VIEW_CONTENT"
        productId={product.id}
        value={advertisedPrice}
      />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-6 lg:pb-12">
        <Link
          href={publicSiteContextHref(workspace.slug, "products")}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Semua produk
        </Link>

        <VariantSelectionProvider
          imageByVariantId={imageByVariantId}
          initialSelectedId={preselectedVariantId}
        >
        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_470px]">
          <ProductGallery images={galleryImages} alt={product.name} />

          <div className="flex flex-col lg:sticky lg:top-20 lg:self-start">
            <div className="flex flex-wrap items-center gap-2">
              {product.category ? (
                <Badge variant="secondary">{product.category.name}</Badge>
              ) : null}
              <Badge variant="outline">
                {productTypeLabel(product.type)}
              </Badge>
              {soldOut ? (
                <Badge className="bg-zinc-900 text-white">Stok habis</Badge>
              ) : null}
            </div>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              {product.name}
            </h1>

            <div className="mt-4 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight text-zinc-900">
                {priceRange.varies
                  ? `${formatPrice(priceRange.min)} – ${formatPrice(priceRange.max)}`
                  : formatPrice(priceRange.min)}
              </span>
              {discounted && !priceRange.varies ? (
                <>
                  <span className="text-base text-zinc-400 line-through">
                    {formatPrice(product.price)}
                  </span>
                  {savingsPct > 0 ? (
                    <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      Hemat {savingsPct}%
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>

            <p className="mt-1.5 text-xs text-zinc-500">
              {product.type === "DIGITAL"
                ? "Produk digital — diakses setelah pembayaran"
                : soldOut
                  ? "Stok habis"
                  : `Stok tersedia: ${product.stock}`}
            </p>

            {linkedMembershipPlans.length > 0 ? (
              <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
                    <LockKeyhole className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Termasuk akses membership
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">
                      Setelah pembayaran berhasil, membership akan aktif
                      otomatis untuk email customer yang checkout.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {linkedMembershipPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="rounded-lg border border-zinc-200 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-900">
                          {plan.name}
                        </p>
                        <Badge variant="secondary">
                          {MEMBERSHIP_LEVEL_LABEL[plan.level]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {plan.accessDays === 0
                          ? "Lifetime access"
                          : `${plan.accessDays} hari akses`}
                      </p>
                      {plan.description ? (
                        <p className="mt-2 text-xs leading-5 text-zinc-500">
                          {plan.description}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="flex flex-col items-start gap-1.5 rounded-xl bg-zinc-50 p-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-zinc-700 ring-1 ring-zinc-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-medium leading-tight text-zinc-700">
                  Pembayaran aman
                </span>
              </div>
              <div className="flex flex-col items-start gap-1.5 rounded-xl bg-zinc-50 p-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-zinc-700 ring-1 ring-zinc-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-medium leading-tight text-zinc-700">
                  Kualitas terjamin
                </span>
              </div>
              <div className="flex flex-col items-start gap-1.5 rounded-xl bg-zinc-50 p-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-zinc-700 ring-1 ring-zinc-200">
                  {product.type === "DIGITAL" ? (
                    <Zap className="h-3.5 w-3.5" />
                  ) : (
                    <Truck className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="text-[11px] font-medium leading-tight text-zinc-700">
                  {product.type === "DIGITAL" ? "Akses digital" : "Siap dikirim"}
                </span>
              </div>
            </div>

            {product.description ? (
              <div className="mt-6 rounded-xl border border-zinc-200 p-4">
                <h2 className="text-sm font-semibold text-zinc-900">{content.descriptionHeading}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600">
                  {product.description}
                </p>
              </div>
            ) : null}

            {product.details ? (
              <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <h2 className="text-sm font-semibold text-zinc-900">
                  {content.detailsHeading}
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600">
                  {product.details}
                </p>
              </div>
            ) : null}

            <div className="mt-6 border-t border-zinc-200 pt-5">
              <AddToCartButton
                workspaceId={workspace.id}
                productId={product.id}
                basePrice={productPrice}
                variants={product.variants.map((variant) => ({
                  id: variant.id,
                  name: variant.name,
                  price: variant.price,
                  discountPrice: variant.discountPrice,
                  stock: variant.stock,
                  options: variant.options,
                  // The same resolved photo the gallery uses for this variant.
                  imageUrl: imageByVariantId[variant.id] ?? null,
                }))}
                axes={readVariantAxes(product.variantOptions)}
                tracksInventory={product.type === "PHYSICAL"}
                disabled={soldOut}
                withQuantity
                metaEvent={{ customData: productMetaData }}
              />
              {soldOut ? (
                <StockWatchForm
                  workspaceSlug={workspace.slug}
                  productId={product.id}
                  variantId={preselectedVariantId}
                />
              ) : null}
              <ProductEngagement workspaceId={workspace.id} workspaceSlug={workspace.slug} productId={product.id} member={Boolean(member)} wishlisted={Boolean(wishlist)} reviewOrderItemId={reviewItem?.id ?? null} />
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">
              {content.checkoutNote}
            </p>
          </div>
        </div>
        </VariantSelectionProvider>
        {product.reviews.length > 0 ? (
          <section className="mt-14 border-t border-zinc-200 pt-10"><div className="flex items-baseline justify-between"><h2 className="text-xl font-semibold">Ulasan pembeli</h2><span className="text-sm text-zinc-500">{averageRating.toFixed(1)} / 5 · {reviewCount} ulasan</span></div><div className="mt-5 grid gap-3 md:grid-cols-2">{product.reviews.map((review) => <article key={review.id} className="rounded-lg border border-zinc-200 p-4"><p className="text-sm font-semibold">{"★".repeat(review.rating)}<span className="text-zinc-300">{"★".repeat(5-review.rating)}</span></p>{review.title ? <h3 className="mt-2 font-medium">{review.title}</h3> : null}{review.body ? <p className="mt-1 text-sm leading-6 text-zinc-600">{review.body}</p> : null}<p className="mt-3 text-xs text-zinc-500">{review.customerName} · Pembelian terverifikasi</p></article>)}</div></section>
        ) : null}
        {relatedProducts.length > 0 ? <section className="mt-14 border-t border-zinc-200 pt-10"><h2 className="text-xl font-semibold">Produk terkait</h2><div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{relatedProducts.map((related) => <ProductCard key={related.id} product={related} workspaceSlug={workspace.slug} />)}</div></section> : null}
        <RecentlyViewedProducts workspaceSlug={workspace.slug} productId={product.id} />
      </main>
    </div>
  );
}

function productTypeLabel(type: string) {
  if (type === "DIGITAL") return "Digital";
  return "Fisik";
}
