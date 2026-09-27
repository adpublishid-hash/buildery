import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  analyticsCreate: vi.fn(),
  analyticsGroupBy: vi.fn(),
  submissionGroupBy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsEvent: {
      create: db.analyticsCreate,
      groupBy: db.analyticsGroupBy,
      count: vi.fn(),
    },
    formSubmission: { groupBy: db.submissionGroupBy },
  },
}));

import { getFormFunnels, recordFormView } from "@/lib/analytics";

function view(formId: string, formStep: number, count: number) {
  return { formId, formStep, _count: { _all: count } };
}

describe("getFormFunnels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.analyticsGroupBy.mockResolvedValue([]);
    db.submissionGroupBy.mockResolvedValue([]);
  });

  it("returns nothing without doing a query when given no forms", async () => {
    expect(await getFormFunnels([])).toEqual({});
    expect(db.analyticsGroupBy).not.toHaveBeenCalled();
  });

  it("computes views, submissions, and conversion", async () => {
    db.analyticsGroupBy.mockResolvedValue([view("f1", 0, 200)]);
    db.submissionGroupBy.mockResolvedValue([
      { formId: "f1", _count: { _all: 50 } },
    ]);

    const funnels = await getFormFunnels(["f1"]);

    expect(funnels.f1.views).toBe(200);
    expect(funnels.f1.submissions).toBe(50);
    expect(funnels.f1.conversionRate).toBeCloseTo(0.25);
  });

  it("reports zero conversion rather than dividing by zero when unseen", async () => {
    db.submissionGroupBy.mockResolvedValue([
      { formId: "f1", _count: { _all: 3 } },
    ]);

    const funnels = await getFormFunnels(["f1"]);

    expect(funnels.f1.views).toBe(0);
    expect(funnels.f1.conversionRate).toBe(0);
  });

  it("builds the step-reach curve for a multi-step form", async () => {
    db.analyticsGroupBy.mockResolvedValue([
      view("f1", 0, 100),
      view("f1", 1, 60),
      view("f1", 2, 25),
    ]);

    const funnels = await getFormFunnels(["f1"]);

    expect(funnels.f1.stepReach).toEqual([100, 60, 25]);
  });

  it("fills a step nobody reached with zero instead of a hole", async () => {
    db.analyticsGroupBy.mockResolvedValue([view("f1", 0, 10), view("f1", 2, 4)]);

    const funnels = await getFormFunnels(["f1"]);

    expect(funnels.f1.stepReach).toEqual([10, 0, 4]);
  });

  it("keeps forms apart and includes ones with no data at all", async () => {
    db.analyticsGroupBy.mockResolvedValue([view("f1", 0, 5)]);
    db.submissionGroupBy.mockResolvedValue([
      { formId: "f2", _count: { _all: 2 } },
    ]);

    const funnels = await getFormFunnels(["f1", "f2", "f3"]);

    expect(funnels.f1).toEqual({
      views: 5,
      submissions: 0,
      conversionRate: 0,
      stepReach: [5],
    });
    expect(funnels.f2.submissions).toBe(2);
    expect(funnels.f3).toEqual({
      views: 0,
      submissions: 0,
      conversionRate: 0,
      stepReach: [],
    });
  });

  it("only counts FORM_VIEW rows for the requested forms", async () => {
    await getFormFunnels(["f1"]);

    expect(db.analyticsGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: "FORM_VIEW", formId: { in: ["f1"] } },
      })
    );
  });
});

describe("recordFormView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.analyticsCreate.mockResolvedValue({});
  });

  it("stores a first view as step zero", async () => {
    await recordFormView({ workspaceId: "ws_1", formId: "f1" });

    expect(db.analyticsCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "FORM_VIEW",
        workspaceId: "ws_1",
        formId: "f1",
        formStep: 0,
      }),
    });
  });

  it("clamps a nonsensical step instead of storing it", async () => {
    await recordFormView({ workspaceId: "ws_1", formId: "f1", step: -3 });

    expect(db.analyticsCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ formStep: 0 }),
    });
  });

  it("never lets an analytics failure reach the caller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.analyticsCreate.mockRejectedValue(new Error("db down"));

    await expect(
      recordFormView({ workspaceId: "ws_1", formId: "f1" })
    ).resolves.toBeUndefined();
  });
});
