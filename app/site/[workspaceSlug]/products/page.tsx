import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PackageOpen, Search, SlidersHorizontal } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import {
  storefrontCategories,
  storefrontProducts,
} from "@/lib/storefront-catalog";
import { getStoreWorkspace } from "@/lib/store";
import { resolveContent } from "@/lib/storefront-content";
import { getPageContent } from "@/lib/storefront-content-server";
import { StoreHeader } from "@/components/store/store-header";
import { ProductCard } from "@/components/store/product-card";
import { cn } from "@/lib/utils";
import type { MetaCustomData } from "@/lib/meta-capi";
import { catalogItemId } from "@/lib/ad-catalog";
import { issueMetaEventAuthorization } from "@/lib/meta-event-auth";
import { MetaEventTracker } from "@/components/site/meta-event-tracker";

export const dynamic = "force-dynamic";

const SORTS = {
  newest: { label: "Terbaru" },
  oldest: { label: "Terlama" },
  "price-asc": { label: "Harga terendah" },
  "price-desc": { label: "Harga tertinggi" },
  name: { label: "Nama A→Z" },
} as const;
type SortKey = keyof typeof SORTS;

function parseSort(input: string | undefined): SortKey {
  if (input && input in SORTS) return input as SortKey;
  return "newest";
}

export async function generateMetadata({
  params,
}: {
  params: { workspaceSlug: string };
}): Promise<Metadata> {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return { title: "Store not found" };
  return { title: { absolute: `Products · ${workspace.name}` } };
}

export default async function StoreProductsPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams: { category?: string; sort?: string; q?: string; min?: string; max?: string; page?: string };
}) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();

  const activeCategory = searchParams.category;
  const activeSort = parseSort(searchParams.sort);
  const query = searchParams.q?.trim().slice(0, 80) || "";
  const minPrice = Math.max(0, Number(searchParams.min) || 0);
  const maxPrice = Math.max(0, Number(searchParams.max) || 0);
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1));
  const pageSize = 24;
  // Cached and dropped by tag on any product change: the catalogue is the same
  // for every visitor and only the merchant changes it.
  const [categories, listing] = await Promise.all([
    storefrontCategories(workspace.id),
    storefrontProducts({
      workspaceId: workspace.id,
      category: activeCategory,
      query,
      minPrice,
      maxPrice,
      sort: activeSort,
      page,
      pageSize,
    }),
  ]);
  const products = listing.items;
  const productCount = listing.total;
  const pageCount = Math.max(1, Math.ceil(productCount / pageSize));

  const base = publicSiteContextHref(workspace.slug, "products");
  const content = resolveContent(
    "products_catalog",
    await getPageContent(workspace.id, "products_catalog"),
    { heading: "Products", subheading: "" }
  );

  // Search is signed server-side like every event carrying data, so nobody can
  // post arbitrary search strings into the store's ad accounts.
  const searchMetaData: MetaCustomData | null = query
    ? {
        search_string: query,
        content_type: "product",
        content_ids: products.slice(0, 10).map((product) => catalogItemId(product.id)),
      }
    : null;
  const searchAuthorization = searchMetaData
    ? issueMetaEventAuthorization({
        workspaceId: workspace.id,
        eventName: "Search",
        customData: searchMetaData,
      })
    : null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />
      {searchMetaData && searchAuthorization ? (
        <MetaEventTracker
          workspaceId={workspace.id}
          eventName="Search"
          eventId={searchAuthorization.eventId}
          serverToken={searchAuthorization.token}
          dedupeKey={`search:${query}`}
          customData={searchMetaData}
        />
      ) : null}

      <main className="mx-auto max-w-6xl px-6 pb-16">
        <header className="border-b border-zinc-200 bg-white px-0 py-10 sm:px-2">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              {content.heading}
            </h1>
            {content.subheading ? (
              <p className="max-w-2xl text-sm leading-6 text-zinc-500 sm:text-base">
                {content.subheading}
              </p>
            ) : null}
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              {productCount} produk
              {activeCategory ? (
                <span className="ml-2 normal-case tracking-normal text-zinc-500">
                  dalam{" "}
                  <span className="font-semibold text-zinc-700">
                    {categories.find((c) => c.slug === activeCategory)?.name ??
                      activeCategory}
                  </span>
                </span>
              ) : null}
            </p>
          </div>
        </header>

        <form className="grid gap-2 border-b border-zinc-200 bg-white py-4 sm:grid-cols-[minmax(0,1fr)_130px_130px_auto]">
          {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
          {activeSort !== "newest" ? <input type="hidden" name="sort" value={activeSort} /> : null}
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input name="q" defaultValue={query} placeholder="Cari produk atau SKU" className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm" /></label>
          <input name="min" type="number" min={0} defaultValue={minPrice || ""} placeholder="Harga min." className="h-9 rounded-lg border border-zinc-200 px-3 text-sm" />
          <input name="max" type="number" min={0} defaultValue={maxPrice || ""} placeholder="Harga max." className="h-9 rounded-lg border border-zinc-200 px-3 text-sm" />
          <button type="submit" className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white">Terapkan</button>
        </form>

        <div className="sticky top-14 z-30 -mx-6 mt-0 border-b border-zinc-200 bg-white/95 px-6 py-3 backdrop-blur sm:mx-0 sm:rounded-none">
          <div className="flex items-center justify-between gap-3">
            {categories.length > 0 ? (
              <div className="flex flex-1 flex-wrap items-center gap-2 overflow-x-auto">
                <CategoryPill href={withSort(base, activeSort)} active={!activeCategory}>
                  Semua
                </CategoryPill>
                {categories.map((c) => (
                  <CategoryPill
                    key={c.id}
                    href={withSort(`${base}?category=${c.slug}`, activeSort)}
                    active={activeCategory === c.slug}
                  >
                    {c.name}
                  </CategoryPill>
                ))}
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <SortMenu
              base={base}
              activeCategory={activeCategory}
              activeSort={activeSort}
            />
          </div>
        </div>

        {products.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
              <PackageOpen className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-base font-semibold text-zinc-900">
              Belum ada produk
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {activeCategory
                ? "Kategori ini belum punya produk aktif."
                : "Toko ini belum menambahkan produk apapun."}
            </p>
            {activeCategory ? (
              <Link
                href={base}
                className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-xs font-medium text-white transition hover:bg-zinc-800"
              >
                Lihat semua produk
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                workspaceSlug={workspace.slug}
              />
            ))}
          </div>
        )}
        {pageCount > 1 ? (
          <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => {
              const next = new URLSearchParams();
              if (activeCategory) next.set("category", activeCategory);
              if (activeSort !== "newest") next.set("sort", activeSort);
              if (query) next.set("q", query);
              if (minPrice) next.set("min", String(minPrice));
              if (maxPrice) next.set("max", String(maxPrice));
              if (number > 1) next.set("page", String(number));
              return <Link key={number} href={`${base}?${next.toString()}`} className={cn("flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm", number === page ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white")}>{number}</Link>;
            })}
          </nav>
        ) : null}
      </main>
    </div>
  );
}

/** Preserves the active sort when navigating between categories. */
function withSort(href: string, sort: SortKey) {
  if (sort === "newest") return href;
  return `${href}${href.includes("?") ? "&" : "?"}sort=${sort}`;
}

function CategoryPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
      )}
    >
      {children}
    </Link>
  );
}

function SortMenu({
  base,
  activeCategory,
  activeSort,
}: {
  base: string;
  activeCategory: string | undefined;
  activeSort: SortKey;
}) {
  // Native <details> dropdown — no client component needed.
  return (
    <details className="relative shrink-0">
      <summary
        className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 [&::-webkit-details-marker]:hidden"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>{SORTS[activeSort].label}</span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
        {(Object.keys(SORTS) as SortKey[]).map((key) => {
          const params = new URLSearchParams();
          if (activeCategory) params.set("category", activeCategory);
          if (key !== "newest") params.set("sort", key);
          const qs = params.toString();
          const href = qs ? `${base}?${qs}` : base;
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "block px-3 py-2 text-xs font-medium transition",
                activeSort === key
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {SORTS[key].label}
            </Link>
          );
        })}
      </div>
    </details>
  );
}
