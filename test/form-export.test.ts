import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  formFindUnique: vi.fn(),
  memberFindUnique: vi.fn(),
  submissionFindMany: vi.fn(),
}));
const auth = vi.hoisted(() => vi.fn());
const iterateSubmissionIds = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    form: { findUnique: db.formFindUnique },
    workspaceMember: { findUnique: db.memberFindUnique },
    formSubmission: { findMany: db.submissionFindMany },
  },
}));
vi.mock("@/lib/form-submission-query", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/form-submission-query")
  >("@/lib/form-submission-query");
  return { ...actual, iterateSubmissionIds };
});

import { GET } from "@/app/api/forms/[formId]/export/route";

const FORM_ID = "form_1";

function request(query = "") {
  return {
    nextUrl: new URL(`http://localhost/api/forms/${FORM_ID}/export${query}`),
  } as never;
}

function form() {
  return {
    id: FORM_ID,
    slug: "kontak",
    workspaceId: "ws_1",
    fields: [
      { name: "name", label: "Name" },
      { name: "email", label: "Email" },
    ],
  };
}

function submission(name: string, email: string, iso: string) {
  return { data: { name, email }, createdAt: new Date(iso) };
}

async function* oneBatch(ids: string[]) {
  yield ids;
}

describe("form CSV export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "user_1" } });
    db.formFindUnique.mockResolvedValue(form());
    db.memberFindUnique.mockResolvedValue({ role: "OWNER" });
    iterateSubmissionIds.mockImplementation(() => oneBatch(["s1", "s2"]));
    db.submissionFindMany.mockResolvedValue([
      submission("Budi", "budi@contoh.id", "2026-09-12T10:00:00.000Z"),
      submission("Siti", "siti@lain.id", "2026-09-12T11:00:00.000Z"),
    ]);
  });

  it("streams a BOM, a header, then one line per submission", async () => {
    const res = await GET(request(), { params: { formId: FORM_ID } });
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe(
      "Submitted at,Name,Email\r\n" +
        "2026-09-12T10:00:00.000Z,Budi,budi@contoh.id\r\n" +
        "2026-09-12T11:00:00.000Z,Siti,siti@lain.id"
    );
  });

  it("sends CSV headers with a filename from the form slug", async () => {
    const res = await GET(request(), { params: { formId: FORM_ID } });

    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="kontak-submissions.csv"'
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("passes the active status and search filter through to the query", async () => {
    await GET(request("?status=NEW&q=budi"), { params: { formId: FORM_ID } });

    expect(iterateSubmissionIds).toHaveBeenCalledWith(
      { formId: FORM_ID, workspaceId: "ws_1", status: "NEW", q: "budi" },
      500
    );
  });

  it("names the file after the filter so downloads are distinguishable", async () => {
    const res = await GET(request("?status=NEW&q=budi"), {
      params: { formId: FORM_ID },
    });

    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="kontak-submissions-new-filtered.csv"'
    );
  });

  it("ignores a bogus status rather than failing the export", async () => {
    await GET(request("?status=NONSENSE"), { params: { formId: FORM_ID } });

    expect(iterateSubmissionIds).toHaveBeenCalledWith(
      expect.objectContaining({ status: "all" }),
      500
    );
  });

  it("walks every batch, not just the first", async () => {
    iterateSubmissionIds.mockImplementation(async function* () {
      yield ["s1"];
      yield ["s2"];
    });
    db.submissionFindMany
      .mockResolvedValueOnce([
        submission("Budi", "budi@contoh.id", "2026-09-12T10:00:00.000Z"),
      ])
      .mockResolvedValueOnce([
        submission("Siti", "siti@lain.id", "2026-09-12T11:00:00.000Z"),
      ]);

    const body = await (
      await GET(request(), { params: { formId: FORM_ID } })
    ).text();

    expect(db.submissionFindMany).toHaveBeenCalledTimes(2);
    expect(body).toContain("Budi");
    expect(body).toContain("Siti");
  });

  it("emits just the header when nothing matches", async () => {
    iterateSubmissionIds.mockImplementation(async function* () {});

    const body = await (
      await GET(request(), { params: { formId: FORM_ID } })
    ).text();

    expect(body).toBe("Submitted at,Name,Email");
    expect(db.submissionFindMany).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    auth.mockResolvedValue(null);

    const res = await GET(request(), { params: { formId: FORM_ID } });

    expect(res.status).toBe(401);
    expect(db.formFindUnique).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user who is not a member of the workspace", async () => {
    db.memberFindUnique.mockResolvedValue(null);

    const res = await GET(request(), { params: { formId: FORM_ID } });

    expect(res.status).toBe(403);
    expect(iterateSubmissionIds).not.toHaveBeenCalled();
  });

  it("refuses a member whose role cannot view content", async () => {
    db.memberFindUnique.mockResolvedValue({ role: "BILLING" });

    const res = await GET(request(), { params: { formId: FORM_ID } });

    expect(res.status).toBe(403);
  });

  it("404s on a form that does not exist", async () => {
    db.formFindUnique.mockResolvedValue(null);

    const res = await GET(request(), { params: { formId: "nope" } });

    expect(res.status).toBe(404);
  });
});
