import "server-only";

import { cookies } from "next/headers";

import {
  ATTRIBUTION_COOKIE,
  decodeAttribution,
  VISITOR_COOKIE,
} from "@/lib/analytics-visitor";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-reporting";

function trim(value: string | null | undefined, max = 500) {
  if (!value) return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

export type PageViewInput = {
  workspaceId: string;
  pageId?: string | null;
  path?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  /** First-party visitor id and landing campaign, so page views join the funnel. */
  visitorId?: string | null;
  attributionCookie?: string | null;
};

/**
 * Records a single page_view event. Analytics must never break a page
 * render, so failures are swallowed and logged.
 */
export async function recordPageView(input: PageViewInput) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        type: "PAGE_VIEW",
        workspaceId: input.workspaceId,
        pageId: input.pageId ?? null,
        path: trim(input.path),
        referrer: trim(input.referrer),
        userAgent: trim(input.userAgent),
        visitorId: trim(input.visitorId, 100),
        ...decodeAttribution(input.attributionCookie ?? undefined),
      },
    });
  } catch (error) {
    reportError("analytics recordPageView failed", error);
  }
}

/** Total page_view count for a single page. */
export async function getPageViewCount(pageId: string) {
  return prisma.analyticsEvent.count({
    where: { pageId, type: "PAGE_VIEW" },
  });
}

/** Page_view counts for many pages at once, keyed by pageId. */
export async function getPageViewCounts(
  pageIds: string[]
): Promise<Record<string, number>> {
  if (pageIds.length === 0) return {};
  const grouped = await prisma.analyticsEvent.groupBy({
    by: ["pageId"],
    where: { type: "PAGE_VIEW", pageId: { in: pageIds } },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of grouped) {
    if (row.pageId) result[row.pageId] = row._count._all;
  }
  return result;
}

/**
 * Records that a form was seen. `step` is 0 for the first view and the step
 * number each time a multi-step form advances, which is what turns the raw
 * rows into a drop-off curve.
 *
 * Best-effort, like page views: a form must never fail to render because
 * analytics is unavailable.
 */
export async function recordFormView(input: {
  workspaceId: string;
  formId: string;
  step?: number;
  referrer?: string | null;
  userAgent?: string | null;
}) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        type: "FORM_VIEW",
        workspaceId: input.workspaceId,
        formId: input.formId,
        formStep: Math.max(0, Math.floor(input.step ?? 0)),
        referrer: trim(input.referrer),
        userAgent: trim(input.userAgent),
      },
    });
  } catch (error) {
    reportError("analytics recordFormView failed", error);
  }
}

export type FormFunnel = {
  views: number;
  submissions: number;
  /** Submissions per view, 0-1. Zero when nobody has looked yet. */
  conversionRate: number;
  /** How many visitors reached each step, index 0 being the first view. */
  stepReach: number[];
};

/** Views, submissions and conversion for many forms at once, keyed by formId. */
export async function getFormFunnels(
  formIds: string[]
): Promise<Record<string, FormFunnel>> {
  if (formIds.length === 0) return {};

  const [viewRows, submissionRows] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["formId", "formStep"],
      where: { type: "FORM_VIEW", formId: { in: formIds } },
      _count: { _all: true },
    }),
    prisma.formSubmission.groupBy({
      by: ["formId"],
      where: { formId: { in: formIds } },
      _count: { _all: true },
    }),
  ]);

  const submissionsByForm = new Map(
    submissionRows.map((row) => [row.formId, row._count._all])
  );

  const stepsByForm = new Map<string, number[]>();
  for (const row of viewRows) {
    if (!row.formId) continue;
    const steps = stepsByForm.get(row.formId) ?? [];
    const index = Math.max(0, row.formStep ?? 0);
    steps[index] = (steps[index] ?? 0) + row._count._all;
    stepsByForm.set(row.formId, steps);
  }

  const result: Record<string, FormFunnel> = {};
  for (const formId of formIds) {
    const stepReach = Array.from(
      stepsByForm.get(formId) ?? [],
      (count) => count ?? 0
    );
    const views = stepReach[0] ?? 0;
    const submissions = submissionsByForm.get(formId) ?? 0;
    result[formId] = {
      views,
      submissions,
      conversionRate: views > 0 ? submissions / views : 0,
      stepReach,
    };
  }
  return result;
}

export type ConversionEventInput = {
  workspaceId: string;
  type: "VIEW_CONTENT" | "ADD_TO_CART" | "BEGIN_CHECKOUT" | "PURCHASE";
  productId?: string | null;
  orderId?: string | null;
  /** Whole currency units — cart value, or the order total on a purchase. */
  value?: number | null;
  path?: string | null;
};

/**
 * Records one step of the funnel, stamped with who did it and which campaign
 * brought them.
 *
 * Visitor and campaign are read from cookies here rather than passed in, so
 * every call site records them the same way and none can forget. Like page
 * views, a failure is swallowed: analytics must never break a checkout.
 */
export async function recordConversionEvent(input: ConversionEventInput) {
  try {
    const jar = cookies();
    const attribution = decodeAttribution(jar.get(ATTRIBUTION_COOKIE)?.value);

    await prisma.analyticsEvent.create({
      data: {
        type: input.type,
        workspaceId: input.workspaceId,
        productId: input.productId ?? null,
        orderId: input.orderId ?? null,
        value: input.value ?? null,
        path: trim(input.path),
        visitorId: jar.get(VISITOR_COOKIE)?.value ?? null,
        ...attribution,
      },
    });
  } catch (error) {
    reportError("analytics recordConversionEvent failed", error);
  }
}

/**
 * Records the purchase once payment settles.
 *
 * This runs in a payment webhook, where there is no browser and therefore no
 * visitor cookie. The identity and campaign are copied from the checkout event
 * recorded for the same order — which is also the more correct attribution:
 * credit belongs to the campaign that produced the order, not to whatever
 * request happened to confirm the payment.
 */
export async function recordPurchaseEvent(input: {
  workspaceId: string;
  orderId: string;
  value: number;
}) {
  try {
    const existing = await prisma.analyticsEvent.findFirst({
      where: { orderId: input.orderId, type: "BEGIN_CHECKOUT" },
      orderBy: { createdAt: "desc" },
      select: {
        visitorId: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
      },
    });

    // Webhooks can be delivered more than once; one order is one purchase.
    const already = await prisma.analyticsEvent.count({
      where: { orderId: input.orderId, type: "PURCHASE" },
    });
    if (already > 0) return;

    await prisma.analyticsEvent.create({
      data: {
        type: "PURCHASE",
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        value: input.value,
        visitorId: existing?.visitorId ?? null,
        utmSource: existing?.utmSource ?? null,
        utmMedium: existing?.utmMedium ?? null,
        utmCampaign: existing?.utmCampaign ?? null,
        utmContent: existing?.utmContent ?? null,
        utmTerm: existing?.utmTerm ?? null,
      },
    });
  } catch (error) {
    reportError("analytics recordPurchaseEvent failed", error);
  }
}
