import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { serverTimeZone } from "@/lib/analytics-aggregates";

/**
 * Daily rollup of the raw analytics events.
 *
 * `AnalyticsEvent` grew forever — nothing pruned it — and every chart scanned
 * it. One row per workspace per day fixes both: charts read the rollup, and
 * raw events can be deleted once their day is rolled up, while the history
 * stays.
 *
 * Recent days are recomputed on every run rather than incremented, so a late
 * event (a webhook arriving minutes after the fact) still lands in the right
 * day, and a re-run can never double count.
 */

/** Days recomputed on every run. */
const RECENT_DAYS = 3;
/** Older days filled in per run, so a first run does not scan everything. */
const BACKFILL_DAYS_PER_RUN = 45;
/** Raw events are deleted after this, once their day has a rollup row. */
export const RAW_EVENT_RETENTION_DAYS = Number(
  process.env.ANALYTICS_RAW_RETENTION_DAYS || 180
);

export type RollupSummary = { days: number; workspaces: number; pruned: number };

const VISITOR_KEY = Prisma.sql`COALESCE("visitorId", 'ua:' || COALESCE("userAgent", 'unknown'))`;

/**
 * Recomputes the last few days plus the oldest days still missing, then prunes
 * raw events that are past retention and already rolled up.
 */
export async function rollupAnalytics(
  options: { now?: Date; retentionDays?: number } = {}
): Promise<RollupSummary> {
  const now = options.now ?? new Date();
  const timeZone = serverTimeZone();
  const recentFrom = startOfLocalDay(new Date(now.getTime() - (RECENT_DAYS - 1) * DAY_MS));

  const written = await rollupRange({ from: recentFrom, to: now, timeZone });

  // The oldest days that have events but no rollup row yet.
  const backfilled = await backfillMissingDays({ before: recentFrom, timeZone });

  const pruned = await pruneRolledUpEvents(
    now,
    timeZone,
    options.retentionDays ?? RAW_EVENT_RETENTION_DAYS
  );
  return {
    days: written.days + backfilled.days,
    workspaces: Math.max(written.workspaces, backfilled.workspaces),
    pruned,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function rollupRange(input: { from: Date; to: Date; timeZone: string }) {
  const rows = await prisma.$queryRaw<
    Array<{
      workspaceId: string;
      day: Date;
      page_views: bigint;
      visitors: bigint;
      view_content: bigint;
      add_to_cart: bigint;
      checkouts: bigint;
      purchases: bigint;
      revenue: bigint;
    }>
  >`
    SELECT
      "workspaceId",
      date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${input.timeZone}) AS day,
      COUNT(*) FILTER (WHERE "type" = 'PAGE_VIEW')::bigint AS page_views,
      COUNT(DISTINCT ${VISITOR_KEY}) FILTER (WHERE "type" = 'PAGE_VIEW')::bigint AS visitors,
      COUNT(*) FILTER (WHERE "type" = 'VIEW_CONTENT')::bigint AS view_content,
      COUNT(*) FILTER (WHERE "type" = 'ADD_TO_CART')::bigint AS add_to_cart,
      COUNT(*) FILTER (WHERE "type" = 'BEGIN_CHECKOUT')::bigint AS checkouts,
      COUNT(DISTINCT "orderId") FILTER (WHERE "type" = 'PURCHASE')::bigint AS purchases,
      COALESCE(SUM("value") FILTER (WHERE "type" = 'PURCHASE'), 0)::bigint AS revenue
    FROM "AnalyticsEvent"
    WHERE ("createdAt" AT TIME ZONE 'UTC') >= ${input.from} AND ("createdAt" AT TIME ZONE 'UTC') <= ${input.to}
    GROUP BY 1, 2
  `;

  for (const row of rows) {
    const data = {
      pageViews: Number(row.page_views),
      visitors: Number(row.visitors),
      viewContent: Number(row.view_content),
      addToCart: Number(row.add_to_cart),
      checkouts: Number(row.checkouts),
      purchases: Number(row.purchases),
      revenue: Number(row.revenue),
    };
    await prisma.analyticsDailyStat.upsert({
      where: { workspaceId_day: { workspaceId: row.workspaceId, day: row.day } },
      update: data,
      create: { workspaceId: row.workspaceId, day: row.day, ...data },
    });
  }

  return {
    days: rows.length,
    workspaces: new Set(rows.map((row) => row.workspaceId)).size,
  };
}

async function backfillMissingDays(input: { before: Date; timeZone: string }) {
  const missing = await prisma.$queryRaw<Array<{ workspaceId: string; day: Date }>>`
    SELECT grouped."workspaceId", grouped.day
    FROM (
      SELECT
        e."workspaceId" AS "workspaceId",
        date_trunc('day', (e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${input.timeZone}) AS day
      FROM "AnalyticsEvent" e
      WHERE (e."createdAt" AT TIME ZONE 'UTC') < ${input.before}
      GROUP BY 1, 2
    ) grouped
    WHERE NOT EXISTS (
      SELECT 1 FROM "AnalyticsDailyStat" s
      WHERE s."workspaceId" = grouped."workspaceId" AND s."day" = grouped.day
    )
    ORDER BY grouped.day ASC
    LIMIT ${BACKFILL_DAYS_PER_RUN}
  `;
  if (missing.length === 0) return { days: 0, workspaces: 0 };

  // `day` is a local calendar date that Postgres hands back as a zone-less
  // timestamp, which the driver then reads as UTC midnight. In a zone ahead of
  // UTC that instant is hours *after* the local day actually began, so using it
  // as a lower bound silently skipped every event in those first hours. The
  // bounds are rebuilt from the calendar dates instead.
  const from = localDayStart(missing[0].day, input.timeZone);
  const to = new Date(
    localDayStart(missing[missing.length - 1].day, input.timeZone).getTime() +
      DAY_MS -
      1
  );
  return rollupRange({ from, to, timeZone: input.timeZone });
}

/**
 * Deletes raw events past retention, but only for days already rolled up, so
 * pruning can never destroy a day that was never summarised.
 */
async function pruneRolledUpEvents(now: Date, timeZone: string, retentionDays: number) {
  const cutoff = startOfLocalDay(new Date(now.getTime() - retentionDays * DAY_MS));
  const result = await prisma.$executeRaw`
    DELETE FROM "AnalyticsEvent" e
    WHERE (e."createdAt" AT TIME ZONE 'UTC') < ${cutoff}
      AND EXISTS (
        SELECT 1 FROM "AnalyticsDailyStat" s
        WHERE s."workspaceId" = e."workspaceId"
          AND s."day" = date_trunc('day', (e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})
      )
  `;
  return result;
}

export type DailySeriesRow = {
  day: string;
  pageViews: number;
  visitors: number;
  orders: number;
  revenue: number;
};

/**
 * Day-by-day series for charts and exports: the rollup for finished days, raw
 * events for today (the rollup runs hourly, so today is always partial).
 */
export async function analyticsDailySeries(input: {
  workspaceId: string;
  from: Date;
  to: Date;
}): Promise<Map<string, DailySeriesRow>> {
  const timeZone = serverTimeZone();
  // `day` holds the local calendar date stored at UTC midnight, so filters and
  // keys must be built the same way rather than from a local-time instant.
  const todayKey = utcMidnightOfLocalDate(new Date());

  const rolled = await prisma.analyticsDailyStat.findMany({
    where: {
      workspaceId: input.workspaceId,
      day: {
        gte: utcMidnightOfLocalDate(input.from),
        lte: utcMidnightOfLocalDate(input.to),
      },
    },
    orderBy: { day: "asc" },
  });

  const series = new Map<string, DailySeriesRow>();
  for (const row of rolled) {
    if (row.day >= todayKey) continue;
    series.set(dayKey(row.day), {
      day: dayKey(row.day),
      pageViews: row.pageViews,
      visitors: row.visitors,
      orders: row.purchases,
      revenue: row.revenue,
    });
  }

  // Days the rollup has not covered yet — today always, plus anything the job
  // has not reached (it backfills in batches, and a store's first hour after
  // deploy has no rollup at all). Without this the chart would show zeros for
  // data that is right there in the raw events.
  const missing: Date[] = [];
  for (
    let day = new Date(Math.max(startOfLocalDay(input.from).getTime(), 0));
    day <= input.to;
    day = new Date(day.getTime() + DAY_MS)
  ) {
    const key = localDayKey(day);
    if (!series.has(key)) missing.push(new Date(day));
    if (missing.length > 400) break;
  }

  if (missing.length > 0) {
    const liveFrom = missing[0];
    const liveTo = new Date(missing[missing.length - 1].getTime() + DAY_MS - 1);
    const live = await prisma.$queryRaw<
      Array<{ day: string; page_views: bigint; visitors: bigint; purchases: bigint; revenue: bigint }>
    >`
      SELECT
        to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
        COUNT(*) FILTER (WHERE "type" = 'PAGE_VIEW')::bigint AS page_views,
        COUNT(DISTINCT ${VISITOR_KEY}) FILTER (WHERE "type" = 'PAGE_VIEW')::bigint AS visitors,
        COUNT(DISTINCT "orderId") FILTER (WHERE "type" = 'PURCHASE')::bigint AS purchases,
        COALESCE(SUM("value") FILTER (WHERE "type" = 'PURCHASE'), 0)::bigint AS revenue
      FROM "AnalyticsEvent"
      WHERE "workspaceId" = ${input.workspaceId}
        AND ("createdAt" AT TIME ZONE 'UTC') >= ${liveFrom}
        AND ("createdAt" AT TIME ZONE 'UTC') <= ${liveTo}
      GROUP BY 1
    `;
    for (const row of live) {
      series.set(row.day, {
        day: row.day,
        pageViews: Number(row.page_views),
        visitors: Number(row.visitors),
        orders: Number(row.purchases),
        revenue: Number(row.revenue),
      });
    }
  }

  return series;
}

/**
 * The instant a local calendar day begins.
 *
 * `date` carries the date parts in UTC (that is how the zone-less timestamp
 * arrives); the offset of `timeZone` on that day turns them into a real moment.
 */
function localDayStart(date: Date, timeZone: string) {
  const key = date.toISOString().slice(0, 10);
  // Midnight UTC of the same calendar date, then shifted by the zone's offset.
  const utcMidnight = new Date(`${key}T00:00:00Z`);
  const offsetMs = zoneOffsetMs(utcMidnight, timeZone);
  return new Date(utcMidnight.getTime() - offsetMs);
}

/** How far `timeZone` runs ahead of UTC at that instant, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - at.getTime();
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Local calendar date, matching the keys `eachDayKey` produces for charts. */
function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** The stored `day` is a calendar date at UTC midnight, so read it in UTC. */
function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcMidnightOfLocalDate(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}
