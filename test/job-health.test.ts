import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  scheduledJobFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { scheduledJob: { findMany: db.scheduledJobFindMany } },
}));

// The runner pulls in every job handler; the health view only needs its
// schedule constants.
vi.mock("@/lib/jobs/runner", () => ({
  STALE_LOCK_MS: 10 * 60 * 1000,
  RECURRING_JOBS: [
    { kind: "META_CAPI_FLUSH", dedupeKey: "meta-capi-flush", intervalMinutes: 1, maxAttempts: 5 },
    { kind: "LOW_STOCK_ALERT_SWEEP", dedupeKey: "low-stock-alert-sweep", intervalMinutes: 30, maxAttempts: 5 },
  ],
}));

import { getJobHealth, isUnhealthy } from "@/lib/jobs/health";

const now = new Date("2026-09-11T12:00:00Z");

function mockJobs(inFlight: unknown[], finished: unknown[]) {
  db.scheduledJobFindMany.mockImplementation(async (args: any) => {
    const statuses: string[] = args.where.status.in;
    return statuses.includes("PENDING") ? inFlight : finished;
  });
}

function queued(overrides: Record<string, unknown> = {}) {
  return {
    kind: "META_CAPI_FLUSH",
    status: "PENDING",
    runAt: new Date("2026-09-11T11:59:00Z"),
    startedAt: null,
    lockedAt: null,
    attempts: 0,
    maxAttempts: 5,
    lastError: null,
    ...overrides,
  };
}

function finished(overrides: Record<string, unknown> = {}) {
  return {
    kind: "META_CAPI_FLUSH",
    status: "DONE",
    finishedAt: new Date("2026-09-11T11:58:00Z"),
    lastError: null,
    attempts: 0,
    maxAttempts: 5,
    ...overrides,
  };
}

describe("getJobHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobs([], []);
  });

  it("returns one row per recurring sweep, in schedule order", async () => {
    const health = await getJobHealth({ now });

    expect(health.rows.map((row) => row.kind)).toEqual([
      "META_CAPI_FLUSH",
      "LOW_STOCK_ALERT_SWEEP",
    ]);
  });

  it("reports a fresh install as never run rather than healthy", async () => {
    const health = await getJobHealth({ now });

    expect(health.rows.every((row) => row.state === "NEVER_RUN")).toBe(true);
    expect(health.configured).toBe(false);
    expect(health.lastActivityAt).toBeNull();
  });

  it("marks a sweep healthy once it has finished and nothing is queued", async () => {
    mockJobs([], [finished()]);

    const health = await getJobHealth({ now });

    const row = health.rows[0];
    expect(row.state).toBe("OK");
    expect(row.lastFinishedAt).toEqual(new Date("2026-09-11T11:58:00Z"));
    expect(row.lastFinishedStatus).toBe("DONE");
    expect(health.unhealthy).toBe(0);
    expect(health.configured).toBe(true);
  });

  it("flags a job locked in RUNNING past the reclaim window as stale", async () => {
    mockJobs(
      [
        queued({
          status: "RUNNING",
          startedAt: new Date("2026-09-11T11:40:00Z"),
          lockedAt: new Date("2026-09-11T11:40:00Z"),
        }),
      ],
      []
    );

    const health = await getJobHealth({ now });

    expect(health.rows[0].state).toBe("STALE");
    expect(health.unhealthy).toBe(1);
  });

  it("leaves a job that is merely still running alone", async () => {
    mockJobs(
      [
        queued({
          status: "RUNNING",
          startedAt: new Date("2026-09-11T11:58:00Z"),
          lockedAt: new Date("2026-09-11T11:58:00Z"),
        }),
      ],
      []
    );

    const health = await getJobHealth({ now });

    expect(health.rows[0].state).toBe("RUNNING");
    expect(health.unhealthy).toBe(0);
  });

  it("treats a pending job inside its grace window as on schedule", async () => {
    mockJobs([queued({ runAt: new Date("2026-09-11T11:58:00Z") })], []);

    const health = await getJobHealth({ now });

    expect(health.rows[0].state).toBe("SCHEDULED");
  });

  it("flags a pending job that is far past due", async () => {
    mockJobs([queued({ runAt: new Date("2026-09-11T11:30:00Z") })], []);

    const health = await getJobHealth({ now });

    expect(health.rows[0].state).toBe("OVERDUE");
    expect(health.rows[0].overdueMinutes).toBe(30);
  });

  it("gives a fast sweep a grace period wider than its own interval", async () => {
    // A one-minute sweep four minutes late is a slow tick, not a dead worker.
    mockJobs([queued({ runAt: new Date("2026-09-11T11:56:00Z") })], []);

    const health = await getJobHealth({ now });

    expect(health.rows[0].state).toBe("SCHEDULED");
  });

  it("scales the grace period with a slow sweep's interval", async () => {
    mockJobs(
      [
        queued({
          kind: "LOW_STOCK_ALERT_SWEEP",
          runAt: new Date("2026-09-11T11:00:00Z"),
        }),
      ],
      []
    );

    const health = await getJobHealth({ now });

    // 60 minutes late, but a 30-minute sweep tolerates 90.
    expect(health.rows[1].state).toBe("SCHEDULED");
  });

  it("surfaces a sweep that exhausted its retries", async () => {
    mockJobs(
      [],
      [
        finished({
          status: "FAILED",
          lastError: "Meta rejected the batch",
          attempts: 5,
        }),
      ]
    );

    const health = await getJobHealth({ now });

    expect(health.rows[0].state).toBe("FAILED");
    expect(health.rows[0].lastError).toBe("Meta rejected the batch");
    expect(health.rows[0].attempts).toBe(5);
    expect(health.unhealthy).toBe(1);
  });

  it("prefers the queued row's error over the finished one", async () => {
    mockJobs(
      [queued({ lastError: "timeout on retry", attempts: 2 })],
      [finished({ lastError: "older failure" })]
    );

    const health = await getJobHealth({ now });

    expect(health.rows[0].lastError).toBe("timeout on retry");
    expect(health.rows[0].attempts).toBe(2);
  });

  it("reports the newest heartbeat across every sweep", async () => {
    mockJobs(
      [],
      [
        finished({ finishedAt: new Date("2026-09-11T11:58:00Z") }),
        finished({
          kind: "LOW_STOCK_ALERT_SWEEP",
          finishedAt: new Date("2026-09-11T11:30:00Z"),
        }),
      ]
    );

    const health = await getJobHealth({ now });

    expect(health.lastActivityAt).toEqual(new Date("2026-09-11T11:58:00Z"));
  });

  it("only queries the sweeps the runner actually schedules", async () => {
    await getJobHealth({ now });

    for (const call of db.scheduledJobFindMany.mock.calls) {
      expect(call[0].where.kind).toEqual({
        in: ["META_CAPI_FLUSH", "LOW_STOCK_ALERT_SWEEP"],
      });
    }
  });
});

describe("isUnhealthy", () => {
  it("counts stale, overdue, and failed as problems", () => {
    expect(isUnhealthy("STALE")).toBe(true);
    expect(isUnhealthy("OVERDUE")).toBe(true);
    expect(isUnhealthy("FAILED")).toBe(true);
  });

  it("does not alarm on normal lifecycle states", () => {
    expect(isUnhealthy("OK")).toBe(false);
    expect(isUnhealthy("RUNNING")).toBe(false);
    expect(isUnhealthy("SCHEDULED")).toBe(false);
    expect(isUnhealthy("NEVER_RUN")).toBe(false);
  });
});
