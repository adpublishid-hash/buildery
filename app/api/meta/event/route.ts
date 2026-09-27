import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adContextFromRequest, sendWorkspaceAdEvent } from "@/lib/ad-events";
import { isMetaStandardEventName, type MetaCustomData } from "@/lib/meta-capi";
import { rateLimitByIp } from "@/lib/rate-limit";
import { verifyMetaEventAuthorization } from "@/lib/meta-event-auth";
import { shouldSendServerViewContent } from "@/lib/meta-view-content-throttle";

/**
 * Public endpoint for browser pixel events that also need a server twin, sent
 * to every ad platform the workspace has on (Meta CAPI, TikTok Events API)
 * with the browser's event id so each platform deduplicates the pair.
 *
 * Events carrying commercial data must present a token the page minted
 * server-side, so nobody can post a fake Purchase. PageView carries no data
 * and fires on every client navigation, where no fresh token exists, so it is
 * accepted without one — rate limited, and only with no custom data.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const {
    workspaceId,
    eventName,
    eventId,
    customData,
    path,
    sourceUrl,
    referrer,
    token,
  } = (body as Record<string, unknown>) ?? {};

  if (typeof workspaceId !== "string" || !workspaceId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!isMetaStandardEventName(eventName)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (typeof eventId !== "string" || !eventId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const unsignedPageView = eventName === "PageView" && customData == null;
  if (
    !unsignedPageView &&
    !verifyMetaEventAuthorization({
      token,
      workspaceId,
      eventName,
      eventId,
      customData,
    })
  ) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const limit = await rateLimitByIp("meta-event", 180, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const safeEventId = eventId.slice(0, 100);
  const safeCustomData = readCustomData(customData);
  const context = adContextFromRequest(req, makeSourceUrl(req, path, sourceUrl));

  if (
    eventName === "ViewContent" &&
    !(await shouldSendServerViewContent({
      workspaceId,
      customData: safeCustomData,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      fbp: context.fbp,
      fbc: context.fbc,
    }))
  ) {
    return NextResponse.json({ ok: true, throttled: true });
  }

  sendWorkspaceAdEvent(workspaceId, {
    ...context,
    eventName,
    eventId: safeEventId,
    referrerUrl: makeReferrerUrl(referrer),
    customData: safeCustomData,
  }).catch((error) => {
    console.warn(`Ad event ${eventName} queue failed`, error);
  });

  return NextResponse.json({ ok: true });
}

function readCustomData(value: unknown): MetaCustomData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const data: MetaCustomData = {};

  if (typeof raw.content_name === "string") data.content_name = raw.content_name;
  if (typeof raw.content_category === "string") {
    data.content_category = raw.content_category;
  }
  if (typeof raw.content_type === "string") data.content_type = raw.content_type;
  if (Array.isArray(raw.content_ids)) {
    data.content_ids = raw.content_ids
      .filter((id) => typeof id === "string" || typeof id === "number")
      .map(String);
  }
  if (Array.isArray(raw.contents)) {
    data.contents = raw.contents
      .map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null
      )
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => {
        const id = item.id;
        if (typeof id !== "string" && typeof id !== "number") return null;
        return {
          id: String(id),
          quantity:
            typeof item.quantity === "number" && Number.isFinite(item.quantity)
              ? item.quantity
              : undefined,
          item_price:
            typeof item.item_price === "number" &&
            Number.isFinite(item.item_price)
              ? item.item_price
              : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }
  if (typeof raw.currency === "string") data.currency = raw.currency;
  if (typeof raw.value === "number" && Number.isFinite(raw.value)) {
    data.value = raw.value;
  }
  if (typeof raw.num_items === "number" && Number.isFinite(raw.num_items)) {
    data.num_items = raw.num_items;
  }
  if (typeof raw.order_id === "string") data.order_id = raw.order_id;
  if (typeof raw.status === "string") data.status = raw.status;
  if (typeof raw.search_string === "string") data.search_string = raw.search_string;

  return Object.keys(data).length > 0 ? data : null;
}

function makeSourceUrl(
  req: NextRequest,
  path: unknown,
  sourceUrl: unknown
) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))
    ?.toLowerCase()
    .trim();
  if (typeof sourceUrl === "string" && sourceUrl.length <= 1000) {
    try {
      const url = new URL(sourceUrl);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        (!host || url.host.toLowerCase() === host)
      ) {
        return url.href;
      }
    } catch {
      // Fall back to path + request origin below.
    }
  }

  if (typeof path === "string" && path.length <= 1000) {
    try {
      return new URL(path, req.nextUrl.origin).href;
    } catch {
      // Fall through.
    }
  }
  return req.nextUrl.href;
}

function makeReferrerUrl(referrer: unknown) {
  if (typeof referrer !== "string" || referrer.length > 1000) return null;
  try {
    const url = new URL(referrer);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
