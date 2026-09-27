"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { publicSiteHref } from "@/lib/public-url";

type Product = { id: string; slug: string; name: string; price: number; imageUrl: string | null };
export function RecentlyViewedProducts({ workspaceSlug, productId }: { workspaceSlug: string; productId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    const key = `recent-products:${workspaceSlug}`;
    let existing: string[] = [];
    try { existing = JSON.parse(localStorage.getItem(key) || "[]"); } catch { existing = []; }
    const previous = existing.filter((id) => id !== productId).slice(0, 4);
    localStorage.setItem(key, JSON.stringify([productId, ...previous].slice(0, 8)));
    if (previous.length > 0) fetch(`/api/site/${workspaceSlug}/products/recent?ids=${encodeURIComponent(previous.join(","))}`).then((response) => response.ok ? response.json() : { products: [] }).then((result) => setProducts(result.products || [])).catch(() => undefined);
  }, [productId, workspaceSlug]);
  if (products.length === 0) return null;
  return <section className="mt-14 border-t border-zinc-200 pt-10"><h2 className="text-xl font-semibold">Baru dilihat</h2><div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{products.map((product) => <Link key={product.id} href={publicSiteHref(workspaceSlug, `products/${product.slug}`)} className="overflow-hidden rounded-lg border border-zinc-200 bg-white"><span className="flex aspect-square items-center justify-center bg-zinc-50">{product.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
  ) : <Package className="h-6 w-6 text-zinc-300" />}</span><span className="block p-3"><span className="block truncate text-sm font-medium">{product.name}</span><span className="mt-1 block text-xs text-zinc-500">{formatPrice(product.price)}</span></span></Link>)}</div></section>;
}
