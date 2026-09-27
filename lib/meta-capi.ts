import "server-only";

import { cache as reactCache } from "react";
import type { Prisma } from "@prisma/client";

import {
  clearAdEventFlushPokeCache,
  flushAdEventQueue,
  getWorkspaceAdDeliveryStatus,
  pruneAdEvents,
  queueAdEvent,
  type AdDeliveryStatus,
  type AdFlushSummary,
  type AdQueueAdapter,
  type AdQueueResult,
  type AdSendFailure,
  type AdSendFailureKind,
  type AdSendResult,
} from "@/lib/ad-event-queue";
import {
  normalizeCity,
  normalizeCountry,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizePostalCode,
  sha256,
} from "@/lib/ad-match";
import { prisma } from "@/lib/prisma";
import { clearExtraPixelCache, eventTargets, getExtraServerPixels } from "@/lib/ad-pixels";

/**
 * Meta Conversions API adapter.
 *
 * Graph API versions live about two years. v26.0 was the newest live version
 * on 13 Sep 2026 (verified against graph.facebook.com); override with
 * META_GRAPH_API_VERSION when Meta retires it, without a deploy of code.
 */
const META_GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v26.0";
const META_CAPI_TIMEOUT_MS = 10_000;
const META_CAPI_BATCH_SIZE = 1000;
const META_CAPI_MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60;
const META_CAPI_CONFIG_TTL_MS = 30_000;

type CacheFn = <Args extends unknown[], Return>(
  fn: (...args: Args) => Return
) => (...args: Args) => Return;
const requestCache: CacheFn =
  typeof reactCache === "function" ? reactCache : (fn) => fn;

export const META_STANDARD_EVENTS = [
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "AddToWishlist",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "Lead",
  "CompleteRegistration",
  "Contact",
  "CustomizeProduct",
  "Donate",
  "FindLocation",
  "Schedule",
  "StartTrial",
  "SubmitApplication",
  "Subscribe",
] as const;

export type MetaStandardEventName = (typeof META_STANDARD_EVENTS)[number];

export type MetaCustomData = {
  content_name?: string;
  content_category?: string;
  content_type?: string;
  content_ids?: string[];
  contents?: { id: string; quantity?: number; item_price?: number }[];
  currency?: string;
  value?: number;
  num_items?: number;
  order_id?: string;
  status?: string;
  /** What the visitor searched for (Search events). */
  search_string?: string;
};

export type MetaCustomerData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  postalCode?: string | null;
  /** ISO 3166-1 alpha-2, e.g. "ID". */
  country?: string | null;
  /** Stable id for the buyer, e.g. the Customer row id. Hashed before sending. */
  externalId?: string | null;
};

type MetaCapiConfig = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
};

export type MetaCapiEventInput = {
  eventName: MetaStandardEventName;
  eventId: string;
  sourceUrl: string;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  /** Anonymous first-party visitor id; used when no customer id is known. */
  visitorId?: string | null;
  referrerUrl?: string | null;
  customData?: MetaCustomData | null;
  customerData?: MetaCustomerData | null;
  eventTime?: number;
};

export type SendMetaCapiEventInput = MetaCapiConfig & MetaCapiEventInput;

export type MetaCapiEventPayload = Record<string, Prisma.JsonValue> & {
  event_name: MetaStandardEventName;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: Record<string, string>;
  referrer_url?: string;
  custom_data?: Record<string, Prisma.JsonValue>;
};

export type MetaCapiFailureKind = AdSendFailureKind;
export type MetaCapiSendResult = AdSendResult;
export type MetaCapiQueueResult = AdQueueResult;
export type MetaCapiFlushSummary = AdFlushSummary;
export type MetaCapiStatusSummary = AdDeliveryStatus;

const metaCapiConfigCache = new Map<
  string,
  { expiresAt: number; value: MetaCapiConfig | null }
>();

export function isMetaStandardEventName(
  value: unknown
): value is MetaStandardEventName {
  return (
    typeof value === "string" &&
    (META_STANDARD_EVENTS as readonly string[]).includes(value)
  );
}

export const getMetaCapiConfig = requestCache(async (workspaceId: string) => {
  const now = Date.now();
  const cached = metaCapiConfigCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = await readMetaCapiConfig(workspaceId);
  metaCapiConfigCache.set(workspaceId, {
    value,
    expiresAt: now + META_CAPI_CONFIG_TTL_MS,
  });
  return value;
});

export function clearMetaCapiConfigCache(workspaceId?: string) {
  clearExtraPixelCache(workspaceId);
  if (workspaceId) {
    metaCapiConfigCache.delete(workspaceId);
    return;
  }
  metaCapiConfigCache.clear();
}

/** Config for one queue target: "" is the primary pixel, else an extra one. */
async function getMetaTargetConfig(workspaceId: string, target: string) {
  if (!target) return getMetaCapiConfig(workspaceId);
  const extra = (await getExtraServerPixels(workspaceId, "META")).find((p) => p.pixelId === target);
  return extra
    ? ({ pixelId: extra.pixelId, accessToken: extra.accessToken, testEventCode: extra.testEventCode } satisfies MetaCapiConfig)
    : null;
}

/** Kept for existing callers; the flush poke is shared by all providers. */
export const clearMetaCapiFlushPokeCache = clearAdEventFlushPokeCache;

async function readMetaCapiConfig(workspaceId: string) {
  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      metaPixelId: true,
      metaCapiEnabled: true,
      metaCapiAccessToken: true,
      metaCapiTestEventCode: true,
    },
  });

  if (
    !integration?.metaCapiEnabled ||
    !integration.metaPixelId ||
    !integration.metaCapiAccessToken
  ) {
    return null;
  }

  return {
    pixelId: integration.metaPixelId,
    accessToken: integration.metaCapiAccessToken,
    testEventCode: integration.metaCapiTestEventCode,
  } satisfies MetaCapiConfig;
}

export function buildMetaCapiEventPayload(
  input: MetaCapiEventInput
): MetaCapiEventPayload {
  const event: MetaCapiEventPayload = {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.sourceUrl,
    user_data: buildUserData(input),
  };
  if (input.referrerUrl) event.referrer_url = input.referrerUrl;

  const customData = sanitizeCustomData(input.customData);
  if (customData) event.custom_data = customData;

  return event;
}

/** Sends one event immediately, bypassing the queue. Used by "send test event". */
export async function sendMetaCapiEvent(
  input: SendMetaCapiEventInput
): Promise<MetaCapiSendResult> {
  const { pixelId, accessToken, testEventCode, ...eventInput } = input;
  const result = await sendMetaCapiBatch(
    { pixelId, accessToken, testEventCode },
    [buildMetaCapiEventPayload(eventInput)]
  );

  if (!result.ok) {
    console.warn(`Meta CAPI ${input.eventName} failed`, failureLog(result));
  }

  return result;
}

export async function sendMetaCapiBatch(
  config: MetaCapiConfig,
  events: MetaCapiEventPayload[]
): Promise<MetaCapiSendResult> {
  if (events.length === 0) return { ok: true, eventsReceived: 0 };

  // The token travels in the body, not the query string, so it never lands
  // in proxy or access logs that record URLs.
  const body: Record<string, unknown> = {
    data: events,
    access_token: config.accessToken,
  };
  if (config.testEventCode) body.test_event_code = config.testEventCode;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_CAPI_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
        config.pixelId
      )}/events`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      }
    );

    const text = await res.text().catch(() => "");
    if (res.ok) {
      return {
        ok: true,
        eventsReceived: readEventsReceived(text) ?? events.length,
      };
    }

    const metaError = readMetaError(text);
    const classified = classifyHttpFailure(res.status, metaError.code);
    return {
      ok: false,
      retryable: classified.retryable,
      kind: classified.kind,
      status: res.status,
      code: metaError.code ?? undefined,
      error: metaError.message || `HTTP ${res.status}`,
      body: text.slice(0, 500),
    };
  } catch (error) {
    const timedOut = isAbortError(error);
    return {
      ok: false,
      retryable: true,
      kind: timedOut ? "timeout" : "network",
      error: timedOut
        ? `Meta CAPI timed out after ${META_CAPI_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : "Meta CAPI request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const metaQueueAdapter: AdQueueAdapter<MetaCapiConfig, MetaCapiEventPayload> = {
  provider: "META",
  label: "Meta CAPI",
  maxBatchSize: META_CAPI_BATCH_SIZE,
  maxEventAgeSeconds: META_CAPI_MAX_EVENT_AGE_SECONDS,
  getConfig: (workspaceId, target) => getMetaTargetConfig(workspaceId, target ?? ""),
  readPayload: readQueuedMetaPayload,
  eventTimeSeconds: (payload) => payload.event_time,
  sendBatch: sendMetaCapiBatch,
  // 190: the access token is invalid or expired.
  isTokenError: (failure) => failure.code === 190,
};

/** Queues a Meta-only event. Most callers want sendWorkspaceAdEvent instead. */
export async function sendWorkspaceMetaEvent(
  workspaceId: string,
  input: MetaCapiEventInput
): Promise<MetaCapiQueueResult> {
  const primary = await getMetaCapiConfig(workspaceId);
  const targets = eventTargets(primary?.pixelId ?? null, await getExtraServerPixels(workspaceId, "META"));
  if (targets.length === 0) {
    return { queued: false, reason: "disabled" };
  }
  // One row per pixel, all sharing the event id so each pixel pairs it with
  // its own browser copy.
  const payload = buildMetaCapiEventPayload(input) as Prisma.InputJsonValue;
  const results: MetaCapiQueueResult[] = [];
  for (const target of targets) {
    results.push(
      await queueAdEvent({
        provider: "META",
        workspaceId,
        target,
        eventName: input.eventName,
        eventId: input.eventId,
        payload,
      })
    );
  }
  return results.find((result) => result.queued) ?? results[0];
}

export function flushMetaCapiQueue(
  options: { workspaceLimit?: number; batchSize?: number } = {}
): Promise<MetaCapiFlushSummary> {
  return flushAdEventQueue(metaQueueAdapter, options);
}

export const pruneMetaCapiEvents = pruneAdEvents;

export function getWorkspaceMetaCapiStatus(
  workspaceId: string
): Promise<MetaCapiStatusSummary> {
  return getWorkspaceAdDeliveryStatus(workspaceId, "META");
}

function buildUserData(input: MetaCapiEventInput) {
  const userData: Record<string, string> = {};
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;

  const customer = input.customerData;
  const email = normalizeEmail(customer?.email);
  const phone = normalizePhone(customer?.phone);
  const firstName = normalizeName(customer?.firstName);
  const lastName = normalizeName(customer?.lastName);
  const city = normalizeCity(customer?.city);
  const postalCode = normalizePostalCode(customer?.postalCode);
  const country = normalizeCountry(customer?.country);
  const externalId = customer?.externalId || input.visitorId;

  if (email) userData.em = sha256(email);
  if (phone) userData.ph = sha256(phone);
  if (firstName) userData.fn = sha256(firstName);
  if (lastName) userData.ln = sha256(lastName);
  if (city) userData.ct = sha256(city);
  if (postalCode) userData.zp = sha256(postalCode);
  if (country) userData.country = sha256(country);
  if (externalId) userData.external_id = sha256(externalId);
  return userData;
}

function sanitizeCustomData(customData: MetaCustomData | null | undefined) {
  if (!customData) return null;
  const data: Record<string, Prisma.JsonValue> = {};
  if (customData.content_name) {
    data.content_name = customData.content_name.slice(0, 200);
  }
  if (customData.content_category) {
    data.content_category = customData.content_category.slice(0, 200);
  }
  if (customData.content_type) {
    data.content_type = customData.content_type.slice(0, 80);
  }
  if (customData.content_ids?.length) {
    data.content_ids = customData.content_ids.slice(0, 100).map(String);
  }
  if (customData.contents?.length) {
    data.contents = customData.contents.slice(0, 100).map((item) => ({
      id: String(item.id),
      quantity: numberOrNull(item.quantity),
      item_price: numberOrNull(item.item_price),
    }));
  }
  if (customData.currency) data.currency = customData.currency.toUpperCase();
  if (Number.isFinite(customData.value)) data.value = customData.value ?? null;
  if (Number.isFinite(customData.num_items)) {
    data.num_items = customData.num_items ?? null;
  }
  if (customData.order_id) data.order_id = customData.order_id.slice(0, 100);
  if (customData.status) data.status = customData.status.slice(0, 100);
  if (customData.search_string) {
    data.search_string = customData.search_string.slice(0, 100);
  }
  return Object.keys(data).length ? data : null;
}

function readQueuedMetaPayload(value: Prisma.JsonValue): MetaCapiEventPayload | null {
  if (!isJsonObject(value)) return null;
  if (!isMetaStandardEventName(value.event_name)) return null;
  if (typeof value.event_time !== "number" || !Number.isFinite(value.event_time)) {
    return null;
  }
  if (typeof value.event_id !== "string" || !value.event_id) return null;
  if (value.action_source !== "website") return null;
  if (typeof value.event_source_url !== "string" || !value.event_source_url) {
    return null;
  }
  if (!isJsonObject(value.user_data)) return null;
  return value as MetaCapiEventPayload;
}

function classifyHttpFailure(
  status: number,
  code: number | null
): { retryable: boolean; kind: MetaCapiFailureKind } {
  if (status === 429) return { retryable: true, kind: "rate_limited" };
  if (status === 408 || status === 409 || status === 425) {
    return { retryable: true, kind: "network" };
  }
  if (status >= 500) return { retryable: true, kind: "server" };
  if (code === 190 || status === 401 || status === 403) {
    return { retryable: false, kind: "auth" };
  }
  return { retryable: false, kind: "client" };
}

function readMetaError(text: string): { code: number | null; message: string } {
  if (!text) return { code: null, message: "" };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isJsonObject(parsed) || !isJsonObject(parsed.error)) {
      return { code: null, message: "" };
    }
    const error = parsed.error;
    const code = readNumber(error.code);
    const subcode = readNumber(error.error_subcode);
    const codeText = [code, subcode].filter((item) => item != null).join("/");
    const message =
      typeof error.message === "string" ? error.message : "Meta CAPI failed";
    return {
      code,
      message: codeText ? `${message} (${codeText})` : message,
    };
  } catch {
    return { code: null, message: "" };
  }
}

function readEventsReceived(text: string) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isJsonObject(parsed)) return null;
    return readNumber(parsed.events_received);
  } catch {
    return null;
  }
}

function readNumber(value: Prisma.JsonValue | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function isJsonObject(value: unknown): value is Record<string, Prisma.JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))
  );
}

function failureLog(result: AdSendFailure) {
  return {
    kind: result.kind,
    retryable: result.retryable,
    status: result.status,
    code: result.code,
    error: result.error,
    body: result.body,
  };
}

function numberOrNull(value: number | undefined) {
  return Number.isFinite(value) ? value ?? null : null;
}
