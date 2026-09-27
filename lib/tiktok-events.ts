import "server-only";

import { cache as reactCache } from "react";
import type { Prisma } from "@prisma/client";

import {
  flushAdEventQueue,
  getWorkspaceAdDeliveryStatus,
  queueAdEvent,
  type AdDeliveryStatus,
  type AdFlushSummary,
  type AdQueueAdapter,
  type AdQueueResult,
  type AdSendFailureKind,
  type AdSendResult,
} from "@/lib/ad-event-queue";
import { normalizeEmail, normalizePhone, sha256 } from "@/lib/ad-match";
import type { MetaCapiEventInput } from "@/lib/meta-capi";
import { prisma } from "@/lib/prisma";
import { clearExtraPixelCache, eventTargets, getExtraServerPixels } from "@/lib/ad-pixels";
import { tiktokEventName, tiktokPropertiesFromMeta } from "@/lib/tiktok-event-map";

/**
 * TikTok Events API (v1.3) adapter for the shared ad event queue.
 *
 * TikTok answers most errors with HTTP 200 and a non-zero `code` in the body
 * (verified 13 Sep 2026: a bad token returns 200 with code 40105), so success
 * is `code === 0`, never the HTTP status alone.
 */
const TIKTOK_EVENTS_ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
const TIKTOK_TIMEOUT_MS = 10_000;
/** Kept well under the API's per-request limit. */
const TIKTOK_BATCH_SIZE = 500;
const TIKTOK_MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60;
const TIKTOK_CONFIG_TTL_MS = 30_000;
/** Access token invalid, expired, or revoked. */
const TIKTOK_TOKEN_ERROR_CODES = new Set([40104, 40105, 40106]);
const TIKTOK_RATE_LIMIT_CODE = 40100;

type CacheFn = <Args extends unknown[], Return>(
  fn: (...args: Args) => Return
) => (...args: Args) => Return;
const requestCache: CacheFn =
  typeof reactCache === "function" ? reactCache : (fn) => fn;

export type TikTokConfig = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
};

export type TikTokEventInput = MetaCapiEventInput & {
  ttp?: string | null;
  ttclid?: string | null;
};

export type TikTokEventPayload = Record<string, Prisma.JsonValue> & {
  event: string;
  event_time: number;
  event_id: string;
  user: Record<string, string>;
  page: { url: string; referrer?: string };
  properties?: Record<string, Prisma.JsonValue>;
};

export type TikTokStatusSummary = AdDeliveryStatus;

const configCache = new Map<string, { expiresAt: number; value: TikTokConfig | null }>();

export const getTikTokConfig = requestCache(async (workspaceId: string) => {
  const now = Date.now();
  const cached = configCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;

  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      tiktokPixelId: true,
      tiktokEventsApiEnabled: true,
      tiktokAccessToken: true,
      tiktokTestEventCode: true,
    },
  });
  const value: TikTokConfig | null =
    integration?.tiktokEventsApiEnabled &&
    integration.tiktokPixelId &&
    integration.tiktokAccessToken
      ? {
          pixelId: integration.tiktokPixelId,
          accessToken: integration.tiktokAccessToken,
          testEventCode: integration.tiktokTestEventCode,
        }
      : null;

  configCache.set(workspaceId, { value, expiresAt: now + TIKTOK_CONFIG_TTL_MS });
  return value;
});

export function clearTikTokConfigCache(workspaceId?: string) {
  clearExtraPixelCache(workspaceId);
  if (workspaceId) configCache.delete(workspaceId);
  else configCache.clear();
}

/** Config for one queue target: "" is the primary pixel, else an extra one. */
async function getTikTokTargetConfig(workspaceId: string, target: string) {
  if (!target) return getTikTokConfig(workspaceId);
  const extra = (await getExtraServerPixels(workspaceId, "TIKTOK")).find((p) => p.pixelId === target);
  return extra
    ? ({ pixelId: extra.pixelId, accessToken: extra.accessToken, testEventCode: extra.testEventCode } satisfies TikTokConfig)
    : null;
}

/** Returns null when TikTok has no equivalent of this event. */
export function buildTikTokEventPayload(input: TikTokEventInput): TikTokEventPayload | null {
  const event = tiktokEventName(input.eventName);
  if (!event) return null;

  const payload: TikTokEventPayload = {
    event,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    user: buildUser(input),
    page: {
      url: input.sourceUrl,
      ...(input.referrerUrl ? { referrer: input.referrerUrl } : {}),
    },
  };
  const properties = tiktokPropertiesFromMeta(input.customData);
  if (properties) payload.properties = properties as Record<string, Prisma.JsonValue>;
  return payload;
}

export async function sendTikTokEventsBatch(
  config: TikTokConfig,
  events: TikTokEventPayload[]
): Promise<AdSendResult> {
  if (events.length === 0) return { ok: true, eventsReceived: 0 };

  const body: Record<string, unknown> = {
    event_source: "web",
    event_source_id: config.pixelId,
    data: events,
  };
  if (config.testEventCode) body.test_event_code = config.testEventCode;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIKTOK_TIMEOUT_MS);

  try {
    const res = await fetch(TIKTOK_EVENTS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Access-Token": config.accessToken,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    const parsed = readTikTokResponse(text);

    if (res.ok && parsed.code === 0) {
      return { ok: true, eventsReceived: events.length };
    }

    const classified = classifyTikTokFailure(res.status, parsed.code);
    return {
      ok: false,
      retryable: classified.retryable,
      kind: classified.kind,
      status: res.status,
      code: parsed.code ?? undefined,
      error: parsed.message || `HTTP ${res.status}`,
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
        ? `TikTok Events API timed out after ${TIKTOK_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : "TikTok Events API request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function classifyTikTokFailure(
  status: number,
  code: number | null
): { retryable: boolean; kind: AdSendFailureKind } {
  if (status === 429 || code === TIKTOK_RATE_LIMIT_CODE) {
    return { retryable: true, kind: "rate_limited" };
  }
  if (status >= 500 || (code != null && code >= 50000)) {
    return { retryable: true, kind: "server" };
  }
  if (
    status === 401 ||
    status === 403 ||
    (code != null && (TIKTOK_TOKEN_ERROR_CODES.has(code) || code === 40001))
  ) {
    return { retryable: false, kind: "auth" };
  }
  return { retryable: false, kind: "client" };
}

export const tiktokQueueAdapter: AdQueueAdapter<TikTokConfig, TikTokEventPayload> = {
  provider: "TIKTOK",
  label: "TikTok Events API",
  maxBatchSize: TIKTOK_BATCH_SIZE,
  maxEventAgeSeconds: TIKTOK_MAX_EVENT_AGE_SECONDS,
  getConfig: (workspaceId, target) => getTikTokTargetConfig(workspaceId, target ?? ""),
  readPayload: readQueuedTikTokPayload,
  eventTimeSeconds: (payload) => payload.event_time,
  sendBatch: sendTikTokEventsBatch,
  isTokenError: (failure) =>
    failure.code != null && TIKTOK_TOKEN_ERROR_CODES.has(failure.code),
};

export async function sendWorkspaceTikTokEvent(
  workspaceId: string,
  input: TikTokEventInput
): Promise<AdQueueResult> {
  const primary = await getTikTokConfig(workspaceId);
  const targets = eventTargets(primary?.pixelId ?? null, await getExtraServerPixels(workspaceId, "TIKTOK"));
  if (targets.length === 0) {
    return { queued: false, reason: "disabled" };
  }
  const payload = buildTikTokEventPayload(input);
  if (!payload) return { queued: false, reason: "unsupported" };
  const results: AdQueueResult[] = [];
  for (const target of targets) {
    results.push(
      await queueAdEvent({
        provider: "TIKTOK",
        workspaceId,
        target,
        eventName: input.eventName,
        eventId: input.eventId,
        payload: payload as Prisma.InputJsonValue,
      })
    );
  }
  return results.find((result) => result.queued) ?? results[0];
}

export function flushTikTokQueue(
  options: { workspaceLimit?: number; batchSize?: number } = {}
): Promise<AdFlushSummary> {
  return flushAdEventQueue(tiktokQueueAdapter, options);
}

export function getWorkspaceTikTokStatus(workspaceId: string) {
  return getWorkspaceAdDeliveryStatus(workspaceId, "TIKTOK");
}

function buildUser(input: TikTokEventInput) {
  const user: Record<string, string> = {};
  const customer = input.customerData;
  const email = normalizeEmail(customer?.email);
  const phone = normalizePhone(customer?.phone);
  const externalId = customer?.externalId || input.visitorId;

  if (email) user.email = sha256(email);
  // TikTok hashes phone numbers in E.164, with the leading "+".
  if (phone) user.phone = sha256(`+${phone}`);
  if (externalId) user.external_id = sha256(externalId);
  if (input.ttp) user.ttp = input.ttp;
  if (input.ttclid) user.ttclid = input.ttclid;
  if (input.clientIp) user.ip = input.clientIp;
  if (input.userAgent) user.user_agent = input.userAgent;
  return user;
}

function readQueuedTikTokPayload(value: Prisma.JsonValue): TikTokEventPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Prisma.JsonValue>;
  if (typeof record.event !== "string" || !record.event) return null;
  if (typeof record.event_time !== "number" || !Number.isFinite(record.event_time)) {
    return null;
  }
  if (typeof record.event_id !== "string" || !record.event_id) return null;
  if (!record.user || typeof record.user !== "object" || Array.isArray(record.user)) {
    return null;
  }
  const page = record.page;
  if (
    !page ||
    typeof page !== "object" ||
    Array.isArray(page) ||
    typeof (page as Record<string, unknown>).url !== "string"
  ) {
    return null;
  }
  return record as TikTokEventPayload;
}

function readTikTokResponse(text: string): { code: number | null; message: string } {
  if (!text) return { code: null, message: "" };
  try {
    const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
    const code =
      typeof parsed.code === "number" && Number.isFinite(parsed.code) ? parsed.code : null;
    const message = typeof parsed.message === "string" ? parsed.message : "";
    return { code, message: code != null && code !== 0 ? `${message} (${code})` : message };
  } catch {
    return { code: null, message: "" };
  }
}
