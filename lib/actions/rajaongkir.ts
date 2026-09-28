"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { getStoreWorkspace } from "@/lib/store";
import {
  searchDestinations as searchDestinationsClient,
  type Destination,
  type ShippingQuote,
} from "@/lib/rajaongkir";
import {
  quoteShipping,
  resolveShippingProvider,
  searchShippingDestinations,
  shippingCacheScope,
  StaleDestinationError,
} from "@/lib/shipping/rates";

// Per-process LRU-ish cache: search results for the same keyword on the
// same key are stable for 24h.
const searchCache = new Map<string, { data: Destination[]; at: number }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

async function workspaceShippingCtx(workspaceSlug: string) {
  const ws = await getStoreWorkspace(workspaceSlug);
  if (!ws) return null;
  return resolveShippingProvider(ws.id);
}

/** Re-exported for callers that still import the legacy types. */
export type { Destination, ShippingQuote };
export type ShippingOption = {
  courier: string;
  courierName: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
};

/** Customer-facing destination search (no auth — uses the storefront key). */
export async function searchDestinationsAction(
  workspaceSlug: string,
  keyword: string
): Promise<{ ok: true; data: Destination[] } | { ok: false; error: string }> {
  const q = keyword.trim();
  if (q.length < 3) return { ok: true, data: [] };

  const ctx = await workspaceShippingCtx(workspaceSlug);
  if (!ctx) {
    return { ok: false, error: "Ongkir belum dikonfigurasi pemilik toko." };
  }
  const cacheKey = `${shippingCacheScope(ctx)}:${q.toLowerCase()}`;
  const hit = searchCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { ok: true, data: hit.data };
  }
  try {
    const data = await searchShippingDestinations(ctx, q);
    searchCache.set(cacheKey, { data, at: Date.now() });
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal cari alamat.",
    };
  }
}

/** Admin variant: uses the current session's workspace as the key source. */
export async function searchDestinationsAdminAction(
  keyword: string
): Promise<{ ok: true; data: Destination[] } | { ok: false; error: string }> {
  const q = keyword.trim();
  if (q.length < 3) return { ok: true, data: [] };
  const ctx = await requireCurrentWorkspace();

  const setting = await prisma.ecommerceSetting.findUnique({
    where: { workspaceId: ctx.workspace.id },
    select: { rajaOngkirApiKey: true },
  });
  if (!setting?.rajaOngkirApiKey) {
    return {
      ok: false,
      error: "Isi API key Komerce / RajaOngkir dulu, lalu simpan.",
    };
  }
  try {
    const data = await searchDestinationsClient(setting.rajaOngkirApiKey, q);
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal cari alamat.",
    };
  }
}

export async function calculateShippingAction(
  workspaceSlug: string,
  destDestinationId: string,
  weightGrams: number,
  itemValue?: number
): Promise<
  { ok: true; options: ShippingOption[] } | { ok: false; error: string }
> {
  const ctx = await workspaceShippingCtx(workspaceSlug);
  if (!ctx) {
    return {
      ok: false,
      error: "Ongkir belum dikonfigurasi pemilik toko.",
    };
  }
  if (!destDestinationId) {
    return { ok: false, error: "Pilih alamat tujuan dulu." };
  }
  try {
    const quotes: ShippingQuote[] = await quoteShipping(ctx, {
      destination: destDestinationId,
      weightGrams: Math.max(1, Math.floor(weightGrams || 1000)),
      itemValue,
    });
    const options: ShippingOption[] = quotes.map((q) => ({
      courier: q.courier,
      courierName: q.courierName,
      service: q.service,
      description: q.description,
      cost: q.cost,
      etd: q.etd,
    }));
    return { ok: true, options };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof StaleDestinationError
          ? "Alamat tujuan perlu dipilih ulang."
          : e instanceof Error
            ? e.message
            : "Gagal hitung ongkir.",
    };
  }
}
