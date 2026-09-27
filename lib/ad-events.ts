import "server-only";

import { cache as reactCache } from "react";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import type { AdQueueResult } from "@/lib/ad-event-queue";
import { validClickId, validFacebookCookie } from "@/lib/ad-match";
import {
  CONSENT_COOKIE,
  FBC_COOKIE,
  TTCLID_COOKIE,
  VISITOR_COOKIE,
  readConsent,
  type AdConsent,
} from "@/lib/analytics-visitor";
import { getWorkspaceAdCurrency } from "@/lib/ad-currency";
import {
  ga4ClientIdFromCookie,
  ga4SessionIdFromCookie,
  queueGa4Purchase,
} from "@/lib/ga4-measurement";
import { sendWorkspaceMetaEvent } from "@/lib/meta-capi";
import { prisma } from "@/lib/prisma";
import {
  sendWorkspaceTikTokEvent,
  type TikTokEventInput,
} from "@/lib/tiktok-events";

type CacheFn = <Args extends unknown[], Return>(
  fn: (...args: Args) => Return
) => (...args: Args) => Return;
// React's request cache exists only inside server components; elsewhere (job
// runner, tests) a pass-through keeps these callable.
const cache: CacheFn = typeof reactCache === "function" ? reactCache : (fn) => fn;

/**
 * One server-side ad event, fanned out to every platform the workspace has
 * switched on. Callers describe the event once, under Meta's standard names;
 * each adapter translates it. Every platform gets the same event id, which is
 * also the id the browser pixels use, so each platform deduplicates the
 * browser and server copies.
 */

export type AdEventInput = TikTokEventInput & {
  /** GA4 client id from the `_ga` cookie, for the server-side purchase copy. */
  gaClientId?: string | null;
  /** GA4 session id from the `_ga_<container>` cookie. */
  gaSessionId?: string | null;
  /**
   * The visitor's cookie choice when the event happened. Only consulted when
   * the store requires consent; then anything but "granted" sends nothing.
   */
  adConsent?: AdConsent | null;
};

type SkippedForConsent = { queued: false; reason: "no_consent" };
export type AdEventResults = {
  meta: AdQueueResult | SkippedForConsent;
  tiktok: AdQueueResult | SkippedForConsent;
  ga4: AdQueueResult | SkippedForConsent;
};

const CONSENT_TTL_MS = 30_000;
const consentCache = new Map<string, { value: boolean; expiresAt: number }>();

/** Whether the store holds ad tracking until visitors accept cookies. */
export const workspaceRequiresAdConsent = cache(async (workspaceId: string) => {
  const now = Date.now();
  const cached = consentCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;
  const setting = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: { adConsentRequired: true },
  });
  const value = Boolean(setting?.adConsentRequired);
  consentCache.set(workspaceId, { value, expiresAt: now + CONSENT_TTL_MS });
  return value;
});

export function clearAdConsentCache(workspaceId?: string) {
  if (workspaceId) consentCache.delete(workspaceId);
  else consentCache.clear();
}

export async function sendWorkspaceAdEvent(
  workspaceId: string,
  input: AdEventInput
): Promise<AdEventResults> {
  if (input.adConsent !== "granted" && (await workspaceRequiresAdConsent(workspaceId))) {
    const skipped = { queued: false as const, reason: "no_consent" as const };
    return { meta: skipped, tiktok: skipped, ga4: skipped };
  }
  const event =
    input.customData && (input.customData.currency || input.customData.value != null)
      ? {
          ...input,
          customData: {
            ...input.customData,
            currency: await getWorkspaceAdCurrency(workspaceId),
          },
        }
      : input;
  const [meta, tiktok, ga4] = await Promise.allSettled([
    sendWorkspaceMetaEvent(workspaceId, event),
    sendWorkspaceTikTokEvent(workspaceId, event),
    // GA4 gets only the purchase server-side; see lib/ga4-measurement.ts.
    event.eventName === "Purchase"
      ? queueGa4Purchase(workspaceId, {
          eventId: event.eventId,
          customData: event.customData,
          clientId: event.gaClientId,
          sessionId: event.gaSessionId,
          visitorId: event.visitorId,
          userId: event.customerData?.externalId,
        })
      : Promise.resolve({ queued: false as const, reason: "unsupported" as const }),
  ]);
  // One platform failing to queue must not stop the others, but it must not
  // vanish silently either.
  if (meta.status === "rejected") throw meta.reason;
  if (tiktok.status === "rejected") throw tiktok.reason;
  if (ga4.status === "rejected") throw ga4.reason;
  return { meta: meta.value, tiktok: tiktok.value, ga4: ga4.value };
}

type AdRequestContext = Pick<
  AdEventInput,
  | "sourceUrl"
  | "clientIp"
  | "userAgent"
  | "fbp"
  | "fbc"
  | "ttp"
  | "ttclid"
  | "visitorId"
  | "adConsent"
  | "gaClientId"
  | "gaSessionId"
>;

/**
 * Who and where an event came from, for server actions and server components.
 * The pixels' own cookies (`_fbp`, `_fbc`, `_ttp`) let platforms join the
 * server event to the browser one. When an ad blocker stopped the pixel the
 * click ids the middleware kept are used instead.
 */
export function requestAdContext(fallbackSourceUrl: string): AdRequestContext {
  const h = headers();
  const jar = cookies();
  return buildContext({
    referer: h.get("referer"),
    fallbackSourceUrl,
    realIp: h.get("x-real-ip"),
    forwardedFor: h.get("x-forwarded-for"),
    userAgent: h.get("user-agent"),
    cookie: (name) => jar.get(name)?.value,
    cookieNames: () => jar.getAll().map((c) => c.name),
  });
}

/** Same as requestAdContext, for route handlers that hold the request. */
export function adContextFromRequest(req: NextRequest, sourceUrl: string): AdRequestContext {
  return buildContext({
    referer: null,
    fallbackSourceUrl: sourceUrl,
    realIp: req.headers.get("x-real-ip"),
    forwardedFor: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    cookie: (name) => req.cookies.get(name)?.value,
    cookieNames: () => req.cookies.getAll().map((c) => c.name),
  });
}

function buildContext(input: {
  referer: string | null;
  fallbackSourceUrl: string;
  realIp: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
  cookie: (name: string) => string | undefined;
  cookieNames: () => string[];
}): AdRequestContext {
  const gaSessionCookie = input.cookieNames().find((name) => /^_ga_[A-Z0-9]+$/i.test(name));
  return {
    sourceUrl: validHttpUrl(input.referer) ?? input.fallbackSourceUrl,
    clientIp: clientIpFrom(input.realIp, input.forwardedFor),
    userAgent: input.userAgent,
    fbp: validFacebookCookie(input.cookie("_fbp")),
    fbc:
      validFacebookCookie(input.cookie("_fbc")) ??
      validFacebookCookie(input.cookie(FBC_COOKIE)),
    ttp: validClickId(input.cookie("_ttp")),
    ttclid: validClickId(input.cookie(TTCLID_COOKIE)),
    visitorId: input.cookie(VISITOR_COOKIE) ?? null,
    adConsent: readConsent(input.cookie(CONSENT_COOKIE)),
    gaClientId: ga4ClientIdFromCookie(input.cookie("_ga")),
    gaSessionId: gaSessionCookie ? ga4SessionIdFromCookie(input.cookie(gaSessionCookie)) : null,
  };
}

/**
 * nginx sets X-Real-IP from the socket; X-Forwarded-For can carry whatever the
 * client sent in front of it, so it is only the fallback.
 */
export function clientIpFrom(realIp: string | null, forwardedFor: string | null) {
  const real = realIp?.trim();
  if (real) return real;
  return forwardedFor?.split(",")[0]?.trim() || null;
}

export function validHttpUrl(value: string | null | undefined) {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const STORED_CONTEXT_KEYS = [
  "clientIp",
  "userAgent",
  "fbp",
  "fbc",
  "ttp",
  "ttclid",
  "visitorId",
  "adConsent",
  "gaClientId",
  "gaSessionId",
] as const;

export type StoredAdContext = Partial<
  Pick<AdEventInput, (typeof STORED_CONTEXT_KEYS)[number]>
>;

/** What a Payment keeps from checkout for its later Purchase event. */
export function toStoredAdContext(context: StoredAdContext): Prisma.InputJsonValue {
  const stored: Record<string, string> = {};
  for (const key of STORED_CONTEXT_KEYS) {
    const value = context[key];
    if (typeof value === "string" && value) stored[key] = value.slice(0, 600);
  }
  return stored;
}

export function readStoredAdContext(
  value: Prisma.JsonValue | null | undefined
): StoredAdContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const stored: StoredAdContext = {};
  for (const key of STORED_CONTEXT_KEYS) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item !== "string" || !item) continue;
    if (key === "adConsent") stored.adConsent = readConsent(item);
    else stored[key] = item;
  }
  return stored;
}

/**
 * Clears the checkout browser context once it has done its job. A payment that
 * is no longer pending has already produced its Purchase event; one still
 * pending after 30 days never will. IP address and user agent should not be
 * kept longer than that.
 */
export async function pruneStoredAdContexts(now = new Date()) {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.payment.updateMany({
    where: {
      adContext: { not: Prisma.DbNull },
      OR: [
        { status: { not: "PENDING" }, updatedAt: { lt: hourAgo } },
        { createdAt: { lt: monthAgo } },
      ],
    },
    data: { adContext: Prisma.DbNull },
  });
  return result.count;
}

export { getWorkspaceAdCurrency };
