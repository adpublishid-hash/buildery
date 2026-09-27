"use client";

import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";
import { tiktokEventName, tiktokPropertiesFromMeta } from "@/lib/tiktok-event-map";
import { ga4EventName, ga4ParamsFromMeta } from "@/lib/ga4-event-map";

declare global {
  interface Window {
    gtag?: (
      command: "event" | "set" | "config" | "js",
      target: string,
      params?: Record<string, unknown>
    ) => void;
    fbq?: (
      command: "track",
      eventName: string,
      params?: Record<string, unknown>,
      options?: { eventID?: string }
    ) => void;
    ttq?: {
      page: () => void;
      track: (
        eventName: string,
        params?: Record<string, unknown>,
        options?: { event_id?: string }
      ) => void;
      identify?: (identity: Record<string, string>) => void;
    };
    builderyAnalytics?: {
      measurementId?: string;
      /** "AW-123/label", set when Google Ads purchase conversion is configured. */
      googleAdsPurchaseSendTo?: string;
    };
  }
}

/** Hashed buyer identity a page may know (e.g. the checkout success page). */
export type BrowserAdIdentity = {
  tiktok?: Record<string, string>;
  google?: Record<string, string>;
};

type TrackAdEventInput = {
  workspaceId: string;
  eventName: MetaStandardEventName;
  customData?: MetaCustomData;
  eventId?: string;
  sendServer?: boolean;
  serverToken?: string;
  identity?: BrowserAdIdentity;
};

const PIXEL_RETRY_MS = 250;
const PIXEL_MAX_ATTEMPTS = 10;
const META_VIEW_CONTENT_SERVER_THROTTLE_MS = 30 * 60 * 1000;

export function createMetaEventId(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
}

/**
 * Sends one event to every browser pixel on the page (Meta, TikTok) and asks
 * the server to send its twin to the matching server APIs. All copies share
 * one event id, which is what lets each platform count the pair once.
 */
export function trackAdEvent(input: TrackAdEventInput) {
  const eventId = input.eventId ?? createMetaEventId(input.eventName);
  const customData = input.customData ?? {};
  if (input.identity) applyIdentity(input.identity);
  trackBrowserPixels(input.eventName, customData, eventId);

  if (input.sendServer === false) return eventId;
  if (!shouldSendServerEvent(input)) return eventId;

  sendServerTwin({
    workspaceId: input.workspaceId,
    eventName: input.eventName,
    eventId,
    customData: input.customData ?? null,
    token: input.serverToken,
  });

  return eventId;
}

/** Existing name, kept for the call sites that predate TikTok. */
export const trackMetaEvent = trackAdEvent;

/**
 * PageView for client-side navigations. Meta takes an event id and gets a
 * server twin; TikTok's `ttq.page()` takes none and has no server twin.
 */
export function trackAdPageView(input: {
  workspaceId: string;
  sendServer: boolean;
  pageReferrer?: string | null;
}) {
  const eventId = createMetaEventId("PageView");
  callWhenReady(
    () => typeof window.gtag === "function" && Boolean(window.builderyAnalytics?.measurementId),
    () =>
      window.gtag?.("event", "page_view", {
        page_title: document.title,
        page_location: window.location.href,
        page_path: `${window.location.pathname}${window.location.search}`,
        ...(input.pageReferrer ? { page_referrer: input.pageReferrer } : {}),
        event_id: eventId,
      })
  );
  callWhenReady(
    () => typeof window.fbq === "function",
    () => window.fbq?.("track", "PageView", {}, { eventID: eventId })
  );
  callWhenReady(
    () => typeof window.ttq?.page === "function",
    () => window.ttq?.page()
  );
  if (input.sendServer) {
    sendServerTwin({
      workspaceId: input.workspaceId,
      eventName: "PageView",
      eventId,
      customData: null,
    });
  }
  return eventId;
}

function sendServerTwin(input: {
  workspaceId: string;
  eventName: MetaStandardEventName;
  eventId: string;
  customData: MetaCustomData | null;
  token?: string;
}) {
  fetch("/api/meta/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input,
      path: `${window.location.pathname}${window.location.search}`,
      sourceUrl: window.location.href,
      referrer: document.referrer || null,
    }),
    keepalive: true,
  }).catch(() => {
    // Tracking is best-effort and must never interrupt the user flow.
  });
}

function shouldSendServerEvent(input: TrackAdEventInput) {
  if (input.eventName !== "ViewContent") return true;

  const contentKey = viewContentKey(input.customData);
  if (!contentKey) return true;

  const storageKey = `buildery:meta-capi-view:${input.workspaceId}:${contentKey}`;
  const now = Date.now();
  try {
    const blockedUntil = Number(window.localStorage.getItem(storageKey) ?? 0);
    if (blockedUntil > now) return false;
    window.localStorage.setItem(
      storageKey,
      String(now + META_VIEW_CONTENT_SERVER_THROTTLE_MS)
    );
    return true;
  } catch {
    return true;
  }
}

function viewContentKey(customData: MetaCustomData | undefined) {
  const ids =
    customData?.content_ids?.length
      ? customData.content_ids
      : customData?.contents?.map((item) => item.id);
  const normalized = Array.from(
    new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean))
  );
  return normalized.length > 0
    ? normalized.slice(0, 20).join("|").slice(0, 500)
    : null;
}

function trackBrowserPixels(
  eventName: MetaStandardEventName,
  customData: MetaCustomData,
  eventId: string
) {
  callWhenReady(
    () => typeof window.fbq === "function",
    () => window.fbq?.("track", eventName, customData, { eventID: eventId })
  );

  const tiktokName = tiktokEventName(eventName);
  if (tiktokName) {
    const properties = tiktokPropertiesFromMeta(customData) ?? {};
    callWhenReady(
      () => typeof window.ttq?.track === "function",
      () => window.ttq?.track(tiktokName, properties, { event_id: eventId })
    );
  }

  // GA4 has no event id; purchases are deduplicated by transaction_id, which
  // is also what the server-side Measurement Protocol copy sends.
  const ga4Name = ga4EventName(eventName);
  if (ga4Name) {
    const params = ga4ParamsFromMeta(customData);
    callWhenReady(
      () => typeof window.gtag === "function" && Boolean(window.builderyAnalytics?.measurementId),
      () => window.gtag?.("event", ga4Name, params as Record<string, unknown>)
    );
  }

  if (eventName === "Purchase") {
    const params = ga4ParamsFromMeta(customData);
    callWhenReady(
      () =>
        typeof window.gtag === "function" &&
        Boolean(window.builderyAnalytics?.googleAdsPurchaseSendTo),
      () =>
        window.gtag?.("event", "conversion", {
          send_to: window.builderyAnalytics?.googleAdsPurchaseSendTo,
          value: params.value,
          currency: params.currency,
          // Google Ads counts one conversion per transaction id.
          transaction_id: params.transaction_id ?? eventId,
        })
    );
  }
}

function applyIdentity(identity: BrowserAdIdentity) {
  if (identity.google && Object.keys(identity.google).length > 0) {
    callWhenReady(
      () => typeof window.gtag === "function",
      () => (window.gtag as unknown as (...args: unknown[]) => void)("set", "user_data", identity.google)
    );
  }
  if (identity.tiktok && Object.keys(identity.tiktok).length > 0) {
    callWhenReady(
      () => typeof window.ttq?.identify === "function",
      () => window.ttq?.identify?.(identity.tiktok!)
    );
  }
}

/**
 * Pixel scripts load after hydration, so an event fired on first render can
 * arrive before them. Waits briefly; a pixel that never loads (not configured,
 * or blocked) simply gets nothing.
 */
function callWhenReady(ready: () => boolean, call: () => void, attempt = 0) {
  if (ready()) {
    call();
    return;
  }
  if (attempt >= PIXEL_MAX_ATTEMPTS) return;
  window.setTimeout(() => callWhenReady(ready, call, attempt + 1), PIXEL_RETRY_MS);
}
