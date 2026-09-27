import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// These run against a real Postgres: the queries below are raw SQL, and the
// bug they guard against (timestamps compared in the session's time zone
// instead of UTC) cannot be reproduced with a mocked client.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  countDistinctVisitors,
  deviceBreakdown,
  funnelVisitorCounts,
} from "@/lib/analytics-metrics";
import { analyticsDailySeries, rollupAnalytics } from "@/lib/analytics-rollup";

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 Chrome/118 Mobile Safari/537.36";
const UA_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1";
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/118 Safari/537.36";

const DAY_MS = 24 * 60 * 60 * 1000;
const today = new Date();
today.setHours(10, 0, 0, 0);
// The rollup only counts events up to "now", so pinning the hour would put the
// day's events in the future — and silently roll up nothing — whenever the
// suite runs before 10:00.
if (today.getTime() > Date.now()) today.setTime(Date.now() - 60_000);
const yesterday = new Date(today.getTime() - DAY_MS);

let workspaceId = "";
let ownerId = "";

beforeAll(async () => {
  const tag = `analytics-sql-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;

  const event = (
    type: string,
    at: Date,
    visitorId: string | null,
    userAgent: string | null,
    extra: Record<string, unknown> = {}
  ) => ({ workspaceId, type, createdAt: at, visitorId, userAgent, ...extra });

  await prisma.analyticsEvent.createMany({
    data: [
      event("PAGE_VIEW", today, "v1", UA_IPHONE),
      event("PAGE_VIEW", today, "v1", UA_IPHONE), // same person, twice
      event("PAGE_VIEW", today, "v2", UA_ANDROID),
      event("PAGE_VIEW", today, null, UA_DESKTOP), // written before the visitor cookie existed
      event("PAGE_VIEW", today, null, UA_IPAD),
      event("VIEW_CONTENT", today, "v1", UA_IPHONE),
      event("ADD_TO_CART", today, "v1", UA_IPHONE),
      event("PURCHASE", today, "v1", UA_IPHONE, { value: 250_000 }),
      event("PAGE_VIEW", yesterday, "v3", UA_DESKTOP),
      event("PURCHASE", yesterday, "v3", UA_DESKTOP, { value: 100_000 }),
    ] as never,
  });
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("analytics SQL over a real database", () => {
  const range = () => ({
    workspaceId,
    from: new Date(today.getTime() - 60 * 60 * 1000),
    to: new Date(today.getTime() + 60 * 60 * 1000),
  });

  it("counts people, not events, and finds them inside the range", async () => {
    // Two cookie-less rows fall back to their user agent, so four people.
    await expect(countDistinctVisitors(range())).resolves.toBe(4);
  });

  it("counts each funnel step by distinct visitor", async () => {
    await expect(funnelVisitorCounts(range())).resolves.toEqual({
      visitors: 4,
      viewContent: 1,
      addToCart: 1,
      checkout: 0,
      purchase: 1,
    });
  });

  it("classifies device and browser from the user agent", async () => {
    const rows = await deviceBreakdown(range());
    const byKey = new Map(rows.map((row) => [`${row.device}|${row.browser}`, row.visitors]));
    expect(byKey.get("Mobile|Safari")).toBe(1);
    expect(byKey.get("Mobile|Chrome")).toBe(1);
    expect(byKey.get("Tablet|Safari")).toBe(1);
    expect(byKey.get("Desktop|Chrome")).toBe(1);
  });

  it("rolls days up without double counting when it runs again", async () => {
    // A long retention keeps this test from pruning anything else in the database.
    await rollupAnalytics({ retentionDays: 3650 });
    await rollupAnalytics({ retentionDays: 3650 });

    const stats = await prisma.analyticsDailyStat.findMany({
      where: { workspaceId },
      orderBy: { day: "asc" },
    });
    expect(stats).toHaveLength(2);
    const todayRow = stats[1];
    expect([todayRow.pageViews, todayRow.visitors, todayRow.viewContent, todayRow.addToCart]).toEqual(
      [5, 4, 1, 1]
    );
    expect(todayRow.revenue).toBe(250_000);
  });

  it("serves the chart from the rollup for past days and raw events for today", async () => {
    const series = await analyticsDailySeries({
      workspaceId,
      from: new Date(today.getTime() - 7 * DAY_MS),
      to: new Date(),
    });
    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;

    expect(series.get(key(today))?.pageViews).toBe(5);
    expect(series.get(key(yesterday))?.pageViews).toBe(1);
    expect(series.get(key(yesterday))?.revenue).toBe(100_000);
  });

  it("still shows a day the rollup has not reached yet", async () => {
    // The rollup runs hourly and backfills in batches, so a chart must never
    // show zeros for events that are sitting right there.
    await prisma.analyticsDailyStat.deleteMany({ where: { workspaceId } });

    const series = await analyticsDailySeries({
      workspaceId,
      from: new Date(today.getTime() - 7 * DAY_MS),
      to: new Date(),
    });
    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
    expect(series.get(key(yesterday))?.pageViews).toBe(1);
    expect(series.get(key(today))?.pageViews).toBe(5);

    await rollupAnalytics({ retentionDays: 3650 });
  });

  it("prunes raw events once their day is rolled up", async () => {
    const old = new Date(today.getTime() - 200 * DAY_MS);
    await prisma.analyticsEvent.create({
      data: { workspaceId, type: "PAGE_VIEW", createdAt: old, visitorId: "v-old" },
    });

    await rollupAnalytics({ retentionDays: 190 });

    const remaining = await prisma.analyticsEvent.count({
      where: { workspaceId, createdAt: { lt: new Date(today.getTime() - 190 * DAY_MS) } },
    });
    expect(remaining).toBe(0);
    // The day itself survives in the rollup.
    const rolled = await prisma.analyticsDailyStat.findFirst({
      where: { workspaceId, day: { lt: new Date(today.getTime() - 190 * DAY_MS) } },
    });
    expect(rolled?.pageViews).toBe(1);
    // Recent events are untouched.
    expect(await prisma.analyticsEvent.count({ where: { workspaceId } })).toBe(10);
  });
});
