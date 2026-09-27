import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  memberFindUnique: vi.fn(),
  memberDelete: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/app-email", () => ({ sendAppEmail: vi.fn() }));
vi.mock("@/lib/app-email-templates", () => ({ workspaceInvitationEmail: vi.fn() }));
vi.mock("@/lib/error-reporting", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/saas-limits", () => ({ getUserPlan: vi.fn(), assertCanCreate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: { findUnique: db.memberFindUnique },
    $transaction: db.transaction,
  },
}));

import { removeMemberAction } from "@/lib/actions/members";

describe("workspace member tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "owner-a", email: "owner@example.com" } });
    db.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      workspaceMember: { delete: db.memberDelete },
      workspaceAuditLog: { create: db.auditCreate },
    }));
    db.memberDelete.mockResolvedValue({});
    db.auditCreate.mockResolvedValue({});
  });

  it("rejects a member id owned by another workspace", async () => {
    db.memberFindUnique
      .mockResolvedValueOnce({ id: "caller", role: "OWNER", workspaceId: "workspace-a", workspace: { status: "ACTIVE" } })
      .mockResolvedValueOnce({ id: "target", role: "EDITOR", workspaceId: "workspace-b", user: { email: "other@example.com" } });

    await expect(removeMemberAction("workspace-a", "target")).resolves.toEqual({ ok: false, error: "Anggota tidak ditemukan." });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.memberDelete).not.toHaveBeenCalled();
  });

  it("prevents an admin from removing a peer admin", async () => {
    db.memberFindUnique
      .mockResolvedValueOnce({ id: "caller", role: "ADMIN", workspaceId: "workspace-a", workspace: { status: "ACTIVE" } })
      .mockResolvedValueOnce({ id: "target", role: "ADMIN", workspaceId: "workspace-a", user: { email: "peer@example.com" } });

    const result = await removeMemberAction("workspace-a", "target");
    expect(result.ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("allows an admin to remove a lower-ranked editor in the same workspace", async () => {
    db.memberFindUnique
      .mockResolvedValueOnce({ id: "caller", role: "ADMIN", workspaceId: "workspace-a", workspace: { status: "ACTIVE" } })
      .mockResolvedValueOnce({ id: "target", role: "EDITOR", workspaceId: "workspace-a", user: { email: "editor@example.com" } });

    await expect(removeMemberAction("workspace-a", "target")).resolves.toEqual({ ok: true });
    expect(db.memberDelete).toHaveBeenCalledWith({ where: { id: "target" } });
  });
});
