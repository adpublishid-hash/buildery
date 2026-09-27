import "server-only";

import { cache as reactCache } from "react";

import { adCurrency } from "@/lib/ad-catalog";
import { prisma } from "@/lib/prisma";

type CacheFn = <Args extends unknown[], Return>(
  fn: (...args: Args) => Return
) => (...args: Args) => Return;
// React's request cache exists only inside server components; elsewhere (job
// runner, tests) a pass-through keeps these callable.
const cache: CacheFn = typeof reactCache === "function" ? reactCache : (fn) => fn;

const CURRENCY_TTL_MS = 60_000;
const currencyCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * The store's currency for ad events and feeds. Every server event is
 * normalised to it on the way out, so a hard-coded currency in one caller
 * cannot report a price in the wrong unit.
 */
export const getWorkspaceAdCurrency = cache(async (workspaceId: string) => {
  const now = Date.now();
  const cached = currencyCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;
  const setting = await prisma.ecommerceSetting.findUnique({
    where: { workspaceId },
    select: { currencyCode: true },
  });
  const value = adCurrency(setting?.currencyCode);
  currencyCache.set(workspaceId, { value, expiresAt: now + CURRENCY_TTL_MS });
  return value;
});
