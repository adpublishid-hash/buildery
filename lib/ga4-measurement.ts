import "server-only";

import { cache as reactCache } from "react";
import type { Prisma } from "@prisma/client";

import {
  flushAdEventQueue,
  getWorkspaceAdDeliveryStatus,
  queueAdEvent,
  type AdQueueAdapter,
  type AdQueueResult,
  type AdSendResult,
} from "@/lib/ad-event-queue";
import { getWorkspaceAdCurrency } from "@/lib/ad-currency";
import { sha256 } from "@/lib/ad-match";
import { ga4ParamsFromMeta, type Ga4Params } from "@/lib/ga4-event-map";
import type { MetaCustomData } from "@/lib/meta-capi";
import { prisma } from "@/lib/prisma";

/**
 * GA4 Measurement Protocol: the server-side copy of purchases and refunds.
 *
 * The browser gtag misses a purchase whenever an ad blocker is on or the buyer
 * pays by transfer and never returns to the success page. GA4 deduplicates
 * purchases by transaction_id, so sending the server copy too is safe.
 *
 * Only purchase and refund go through here. Other e-commerce events stay in
 * the browser: GA4 does not deduplicate them, so a server copy would count
 * twice.
 *
 * Measurement Protocol accepts one client per request, so the queue sends one
 * row per request, and it answers 2xx even for malformed events — validation
 * only happens on the debug endpoint, which the "send test event" button uses.
 */
const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const GA4_DEBUG_ENDPOINT = "https://www.google-analytics.com/debug/mp/collect";
const GA4_TIMEOUT_MS = 10_000;
/** timestamp_micros may be at most 72 hours in the past. */
const GA4_MAX_EVENT_AGE_SECONDS = 72 * 60 * 60 - 600;
const GA4_CONFIG_TTL_MS = 30_000;

type CacheFn = <Args extends unknown[], Return>(
  fn: (...args: Args) => Return
) => (...args: Args) => Return;
const requestCache: CacheFn =
  typeof reactCache === "function" ? reactCache : (fn) => fn;

export type Ga4Config = { measurementId: string; apiSecret: string };

export type Ga4Payload = Record<string, Prisma.JsonValue> & {
  client_id: string;
  timestamp_micros: number;
  events: { name: string; params: Record<string, Prisma.JsonValue> }[];
  user_id?: string;
};

const configCache = new Map<string, { value: Ga4Config | null; expiresAt: number }>();

export const getGa4Config = requestCache(async (workspaceId: string) => {
  const now = Date.now();
  const cached = configCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;
  const setting = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: { googleAnalyticsId: true, googleAnalyticsApiSecret: true },
  });
  const value =
    setting?.googleAnalyticsId && setting.googleAnalyticsApiSecret
      ? { measurementId: setting.googleAnalyticsId, apiSecret: setting.googleAnalyticsApiSecret }
      : null;
  configCache.set(workspaceId, { value, expiresAt: now + GA4_CONFIG_TTL_MS });
  return value;
});

export function clearGa4ConfigCache(workspaceId?: string) {
  if (workspaceId) configCache.delete(workspaceId);
  else configCache.clear();
}

/**
 * `_ga` is "GA1.1.<random>.<timestamp>"; GA4's client id is the last two parts.
 * Without the cookie (blocked, or no consent before) the first-party visitor id
 * stands in, so the purchase still lands, attributed to a new client.
 */
export function ga4ClientIdFromCookie(value: string | null | undefined) {
  const match = value?.match(/^GA\d\.\d\.(\d+\.\d+)$/);
  return match ? match[1] : null;
}

/**
 * The session cookie `_ga_<container>` in either format:
 * "GS1.1.<session id>.<n>…" or "GS2.1.s<session id>$o<n>…".
 */
export function ga4SessionIdFromCookie(value: string | null | undefined) {
  if (!value) return null;
  const legacy = value.match(/^GS1\.\d\.(\d{6,})\./);
  if (legacy) return legacy[1];
  const current = value.match(/^GS2\.\d\.s(\d{6,})/);
  return current ? current[1] : null;
}

export function buildGa4Payload(input: {
  name: "purchase" | "refund";
  clientId: string;
  sessionId?: string | null;
  userId?: string | null;
  params: Ga4Params;
  eventTimeMs?: number;
}): Ga4Payload {
  const params: Record<string, Prisma.JsonValue> = {
    ...(input.params as Record<string, Prisma.JsonValue>),
    // Without engagement time GA4 does not attribute the event to a session.
    engagement_time_msec: 1,
  };
  if (input.sessionId) params.session_id = input.sessionId;
  return {
    client_id: input.clientId.slice(0, 100),
    timestamp_micros: (input.eventTimeMs ?? Date.now()) * 1000,
    // Never the raw customer id: GA4 terms forbid personal data in user_id.
    ...(input.userId ? { user_id: sha256(input.userId).slice(0, 64) } : {}),
    events: [{ name: input.name, params }],
  };
}

export async function sendGa4Payload(
  config: Ga4Config,
  payload: Ga4Payload,
  options: { debug?: boolean } = {}
): Promise<AdSendResult & { validationMessages?: unknown[] }> {
  const url = `${options.debug ? GA4_DEBUG_ENDPOINT : GA4_ENDPOINT}?measurement_id=${encodeURIComponent(
    config.measurementId
  )}&api_secret=${encodeURIComponent(config.apiSecret)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GA4_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (res.ok) {
      if (!options.debug) return { ok: true, eventsReceived: payload.events.length };
      const messages = readValidationMessages(text);
      return messages.length === 0
        ? { ok: true, eventsReceived: payload.events.length, validationMessages: [] }
        : {
            ok: false,
            retryable: false,
            kind: "client",
            status: res.status,
            error: describeValidation(messages),
            validationMessages: messages,
          };
    }
    const retryable = res.status === 429 || res.status >= 500;
    return {
      ok: false,
      retryable,
      kind: res.status === 429 ? "rate_limited" : res.status >= 500 ? "server" : "client",
      status: res.status,
      error: `HTTP ${res.status}`,
      body: text.slice(0, 500),
    };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));
    return {
      ok: false,
      retryable: true,
      kind: timedOut ? "timeout" : "network",
      error: timedOut
        ? `GA4 Measurement Protocol timed out after ${GA4_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : "GA4 Measurement Protocol request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const ga4QueueAdapter: AdQueueAdapter<Ga4Config, Ga4Payload> = {
  provider: "GA4",
  label: "GA4 Measurement Protocol",
  maxBatchSize: 1,
  maxEventAgeSeconds: GA4_MAX_EVENT_AGE_SECONDS,
  getConfig: (workspaceId) => getGa4Config(workspaceId),
  readPayload: readQueuedGa4Payload,
  eventTimeSeconds: (payload) => Math.floor(payload.timestamp_micros / 1_000_000),
  sendBatch: (config, payloads) => sendGa4Payload(config, payloads[0]),
  // An invalid API secret is silently accepted by Measurement Protocol, so
  // there is no token error to detect.
  isTokenError: () => false,
};

export async function queueGa4Purchase(
  workspaceId: string,
  input: {
    eventId: string;
    customData: MetaCustomData | null | undefined;
    clientId?: string | null;
    sessionId?: string | null;
    visitorId?: string | null;
    userId?: string | null;
  }
): Promise<AdQueueResult> {
  if (!(await getGa4Config(workspaceId))) return { queued: false, reason: "disabled" };
  const params = ga4ParamsFromMeta(input.customData);
  if (!params.transaction_id) return { queued: false, reason: "unsupported" };
  const clientId = input.clientId || input.visitorId || `bd.${params.transaction_id}`;
  return queueAdEvent({
    provider: "GA4",
    workspaceId,
    eventName: "purchase",
    eventId: input.eventId,
    payload: buildGa4Payload({
      name: "purchase",
      clientId,
      sessionId: input.sessionId,
      userId: input.userId,
      params,
    }) as Prisma.InputJsonValue,
  });
}

/** Reverses (part of) a purchase in GA4 revenue reports. */
export async function queueGa4Refund(workspaceId: string, refundId: string) {
  if (!(await getGa4Config(workspaceId))) return { queued: false, reason: "disabled" } as const;
  const refund = await prisma.orderRefund.findUnique({
    where: { id: refundId },
    select: {
      id: true,
      amount: true,
      status: true,
      order: { select: { orderNumber: true, total: true } },
    },
  });
  if (!refund || refund.status !== "REFUNDED") {
    return { queued: false, reason: "unsupported" } as const;
  }
  const currency = await getWorkspaceAdCurrency(workspaceId);
  return queueAdEvent({
    provider: "GA4",
    workspaceId,
    eventName: "refund",
    eventId: `refund:${refund.id}`,
    payload: buildGa4Payload({
      name: "refund",
      // GA4 applies a refund by transaction id; the client id only has to exist.
      clientId: `bd.${refund.order.orderNumber}`,
      params: {
        transaction_id: refund.order.orderNumber,
        value: refund.amount,
        currency,
      },
    }) as Prisma.InputJsonValue,
  });
}

export function flushGa4Queue(options: { workspaceLimit?: number } = {}) {
  return flushAdEventQueue(ga4QueueAdapter, options);
}

export function getWorkspaceGa4Status(workspaceId: string) {
  return getWorkspaceAdDeliveryStatus(workspaceId, "GA4");
}

function readQueuedGa4Payload(value: Prisma.JsonValue): Ga4Payload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Prisma.JsonValue>;
  if (typeof record.client_id !== "string" || !record.client_id) return null;
  if (typeof record.timestamp_micros !== "number") return null;
  if (!Array.isArray(record.events) || record.events.length === 0) return null;
  return record as Ga4Payload;
}

function readValidationMessages(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text) as { validationMessages?: unknown };
    return Array.isArray(parsed.validationMessages) ? parsed.validationMessages : [];
  } catch {
    return [];
  }
}

function describeValidation(messages: unknown[]) {
  return messages
    .map((message) => {
      const m = message as { description?: string; fieldPath?: string };
      return [m.fieldPath, m.description].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join("; ")
    .slice(0, 500);
}
