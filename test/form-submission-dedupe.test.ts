import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  formFindUnique: vi.fn(),
  submissionFindUnique: vi.fn(),
  submissionCreate: vi.fn(),
}));
const rateLimitByIp = vi.hoisted(() => vi.fn());
const dispatchSubmissionDeliveries = vi.hoisted(() => vi.fn());
const sendWorkspaceMetaEvent = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getCurrentWorkspace: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByIp }));
vi.mock("@/lib/form-delivery", () => ({
  dispatchSubmissionDeliveries,
  retrySubmissionDeliveries: vi.fn(),
}));
vi.mock("@/lib/meta-capi", () => ({ sendWorkspaceMetaEvent }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    form: { findUnique: db.formFindUnique },
    formSubmission: {
      findUnique: db.submissionFindUnique,
      create: db.submissionCreate,
    },
  },
}));

import { submitFormAction } from "@/lib/actions/form-submission";

const FORM_ID = "form_1";

function form() {
  return {
    id: FORM_ID,
    workspaceId: "ws_1",
    isOpen: true,
    redirectUrl: "https://toko.test/terima-kasih",
    slug: "kontak",
    title: "Kontak",
    fields: [
      {
        name: "email",
        label: "Email",
        type: "EMAIL",
        required: true,
        options: null,
        visibleIf: null,
        minLength: null,
        maxLength: null,
        minValue: null,
        maxValue: null,
        pattern: null,
        patternHint: null,
        acceptMime: null,
      },
    ],
    workspace: { name: "Toko", slug: "toko" },
  };
}

function body(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("email", "budi@contoh.id");
  // Past the time-trap: the form was rendered a minute ago.
  fd.set("_ml_t", String(Date.now() - 60_000));
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

describe("submitFormAction idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitByIp.mockResolvedValue({ ok: true, retryAfter: 0, remaining: 5 });
    db.formFindUnique.mockResolvedValue(form());
    db.submissionFindUnique.mockResolvedValue(null);
    db.submissionCreate.mockImplementation(async ({ data }: never) => ({
      ...(data as Record<string, unknown>),
      createdAt: new Date("2026-09-12T10:00:00Z"),
      form: form(),
    }));
    dispatchSubmissionDeliveries.mockResolvedValue(undefined);
    sendWorkspaceMetaEvent.mockResolvedValue(undefined);
  });

  it("stores the request id with a first submission", async () => {
    const result = await submitFormAction(FORM_ID, body({ _ml_rid: "abc-123" }));

    expect(result.ok).toBe(true);
    expect(db.submissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestId: "abc-123" }),
      })
    );
  });

  it("answers a resend from the stored submission without creating a second", async () => {
    db.submissionFindUnique.mockResolvedValue({
      id: "sub_1",
      form: { id: FORM_ID, redirectUrl: "https://toko.test/terima-kasih" },
    });

    const result = await submitFormAction(FORM_ID, body({ _ml_rid: "abc-123" }));

    expect(result).toEqual({
      ok: true,
      data: { redirectUrl: "https://toko.test/terima-kasih" },
    });
    expect(db.submissionCreate).not.toHaveBeenCalled();
    expect(dispatchSubmissionDeliveries).not.toHaveBeenCalled();
  });

  it("does not spend rate-limit budget answering a resend", async () => {
    db.submissionFindUnique.mockResolvedValue({
      id: "sub_1",
      form: { id: FORM_ID, redirectUrl: null },
    });

    await submitFormAction(FORM_ID, body({ _ml_rid: "abc-123" }));

    expect(rateLimitByIp).not.toHaveBeenCalled();
  });

  it("ignores a request id recorded against a different form", async () => {
    db.submissionFindUnique.mockResolvedValue({
      id: "sub_1",
      form: { id: "other_form", redirectUrl: null },
    });

    const result = await submitFormAction(FORM_ID, body({ _ml_rid: "abc-123" }));

    expect(result.ok).toBe(true);
    expect(db.submissionCreate).toHaveBeenCalled();
  });

  it("treats a concurrent duplicate as success rather than an error", async () => {
    db.submissionCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    const result = await submitFormAction(FORM_ID, body({ _ml_rid: "abc-123" }));

    expect(result).toEqual({
      ok: true,
      data: { redirectUrl: "https://toko.test/terima-kasih" },
    });
  });

  it("still surfaces a genuine database failure", async () => {
    db.submissionCreate.mockRejectedValue(new Error("connection lost"));

    await expect(
      submitFormAction(FORM_ID, body({ _ml_rid: "abc-123" }))
    ).rejects.toThrow("connection lost");
  });

  it("accepts a submission with no request id at all", async () => {
    const result = await submitFormAction(FORM_ID, body());

    expect(result.ok).toBe(true);
    expect(db.submissionFindUnique).not.toHaveBeenCalled();
    expect(db.submissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestId: null }),
      })
    );
  });

  it("rejects a malformed request id instead of storing it", async () => {
    await submitFormAction(FORM_ID, body({ _ml_rid: "not/a valid'id" }));

    expect(db.submissionFindUnique).not.toHaveBeenCalled();
    expect(db.submissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestId: null }),
      })
    );
  });

  it("rejects an over-long request id", async () => {
    await submitFormAction(FORM_ID, body({ _ml_rid: "a".repeat(65) }));

    expect(db.submissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestId: null }),
      })
    );
  });

  it("leaves the honeypot short-circuit ahead of the dedupe lookup", async () => {
    const result = await submitFormAction(
      FORM_ID,
      body({ _ml_rid: "abc-123", _ml_company: "bot corp" })
    );

    expect(result).toEqual({ ok: true, data: { redirectUrl: null } });
    expect(db.submissionFindUnique).not.toHaveBeenCalled();
    expect(db.submissionCreate).not.toHaveBeenCalled();
  });
});
