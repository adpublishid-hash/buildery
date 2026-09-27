import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  subscriptionFindUnique: vi.fn(),
  planFindUnique: vi.fn(),
  workspaceCount: vi.fn(),
  workspaceFindUnique: vi.fn(),
  pageCount: vi.fn(),
  productCount: vi.fn(),
  courseCount: vi.fn(),
  formCount: vi.fn(),
  orderCount: vi.fn(),
}));

// React's request cache only exists inside server components; outside them a
// pass-through keeps getUserPlan callable.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    saaSSubscription: { findUnique: db.subscriptionFindUnique },
    saaSPlan: { findUnique: db.planFindUnique },
    workspace: { count: db.workspaceCount, findUnique: db.workspaceFindUnique },
    page: { count: db.pageCount },
    product: { count: db.productCount },
    course: { count: db.courseCount },
    form: { count: db.formCount },
    order: { count: db.orderCount },
  },
}));

import { assertCanAcceptOrder, assertCanCreate, getUserPlan, planHasFeature } from "@/lib/saas-limits";

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan_pro",
    tier: "PRO",
    name: "Pro",
    workspaceLimit: 3,
    pageLimit: 50,
    productLimit: null,
    courseLimit: 10,
    hasAffiliate: true,
    hasMembership: true,
    hasAdvancedAnalytics: false,
    hasAiAssistant: false,
    ...overrides,
  } as never;
}

describe("getUserPlan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the plan of an active subscription", async () => {
    db.subscriptionFindUnique.mockResolvedValue({ status: "ACTIVE", plan: plan() });
    expect(await getUserPlan("user_1")).toMatchObject({ tier: "PRO" });
  });

  it("drops to FREE when the subscription is not active", async () => {
    // A cancelled or unpaid subscription must not keep paid features.
    db.subscriptionFindUnique.mockResolvedValue({ status: "CANCELLED", plan: plan() });
    db.planFindUnique.mockResolvedValue(plan({ tier: "FREE", name: "Free" }));

    expect(await getUserPlan("user_1")).toMatchObject({ tier: "FREE" });
  });

  it("drops to FREE when the paid period has lapsed", async () => {
    // Status ACTIVE saja tidak cukup: sebelum sweep berjalan, langganan yang
    // sudah jatuh tempo masih berstatus ACTIVE di database.
    db.subscriptionFindUnique.mockResolvedValue({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      graceUntil: null,
      plan: plan(),
    });
    db.planFindUnique.mockResolvedValue(plan({ tier: "FREE", name: "Free" }));

    expect(await getUserPlan("user_1")).toMatchObject({ tier: "FREE" });
  });

  it("keeps the paid plan while a past-due subscription is in its grace window", async () => {
    db.subscriptionFindUnique.mockResolvedValue({
      status: "PAST_DUE",
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      graceUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      plan: plan(),
    });

    expect(await getUserPlan("user_1")).toMatchObject({ tier: "PRO" });
    expect(db.planFindUnique).not.toHaveBeenCalled();
  });

  it("falls back to a built-in FREE plan before seeds have run", async () => {
    db.subscriptionFindUnique.mockResolvedValue(null);
    db.planFindUnique.mockResolvedValue(null);

    const result = await getUserPlan("user_1");
    expect(result).toMatchObject({ tier: "FREE", hasAiAssistant: false, hasAffiliate: false });
  });
});

describe("planHasFeature", () => {
  it("reads each feature flag from the plan", () => {
    const p = plan({ hasAffiliate: true, hasMembership: false, hasAdvancedAnalytics: true, hasAiAssistant: false });
    expect(planHasFeature(p, "affiliate")).toBe(true);
    expect(planHasFeature(p, "membership")).toBe(false);
    expect(planHasFeature(p, "advancedAnalytics")).toBe(true);
    expect(planHasFeature(p, "aiAssistant")).toBe(false);
  });
});

describe("assertCanCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.subscriptionFindUnique.mockResolvedValue({ status: "ACTIVE", plan: plan() });
  });

  it("allows creation below the limit", async () => {
    db.workspaceCount.mockResolvedValue(2);
    expect(await assertCanCreate("user_1", "workspace")).toBeNull();
  });

  it("blocks creation at the limit with a readable reason", async () => {
    db.workspaceCount.mockResolvedValue(3);
    expect(await assertCanCreate("user_1", "workspace")).toBe(
      "Your Pro plan allows up to 3 workspaces. Upgrade to add more."
    );
  });

  it("treats a null limit as unlimited without counting", async () => {
    expect(await assertCanCreate("user_1", "product")).toBeNull();
    expect(db.productCount).not.toHaveBeenCalled();
  });

  it("uses the singular for a limit of one", async () => {
    db.subscriptionFindUnique.mockResolvedValue({ status: "ACTIVE", plan: plan({ courseLimit: 1 }) });
    db.courseCount.mockResolvedValue(1);
    expect(await assertCanCreate("user_1", "course")).toContain("up to 1 course.");
  });

  it("blocks course and form creation when their limit is zero", async () => {
    db.subscriptionFindUnique.mockResolvedValue({ status: "ACTIVE", plan: plan({ courseLimit: 0, formLimit: 0 }) });
    db.courseCount.mockResolvedValue(0);
    db.formCount.mockResolvedValue(0);
    expect(await assertCanCreate("user_1", "course")).toContain("up to 0 courses");
    expect(await assertCanCreate("user_1", "form")).toContain("up to 0 forms");
  });

  it("counts only resources in workspaces the user owns", async () => {
    db.pageCount.mockResolvedValue(0);
    await assertCanCreate("user_1", "page");
    expect(db.pageCount).toHaveBeenCalledWith({
      where: { website: { workspace: { createdById: "user_1" } } },
    });
  });
});

describe("assertCanAcceptOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.workspaceFindUnique.mockResolvedValue({ createdById: "user_1" });
    db.subscriptionFindUnique.mockResolvedValue({ status: "ACTIVE", plan: plan({ name: "Free", monthlyOrderLimit: 100 }) });
  });

  it("allows checkout below the monthly allowance", async () => {
    db.orderCount.mockResolvedValue(99);
    expect(await assertCanAcceptOrder("workspace_1", new Date("2026-09-19T00:00:00Z"))).toBeNull();
  });

  it("blocks checkout when the monthly allowance is exhausted", async () => {
    db.orderCount.mockResolvedValue(100);
    expect(await assertCanAcceptOrder("workspace_1", new Date("2026-09-19T00:00:00Z"))).toContain("100 order per bulan");
    expect(db.orderCount).toHaveBeenCalledWith({ where: { workspace: { createdById: "user_1" }, createdAt: { gte: new Date("2026-09-01T00:00:00.000Z") } } });
  });
});
