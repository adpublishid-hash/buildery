import { describe, expect, it } from "vitest";

import {
  assignableMemberRoles,
  can,
  canInWorkspace,
  canManageMember,
  hasAtLeast,
  isOneOf,
  memberHasAtLeast,
} from "@/lib/permissions";

describe("system roles — can()", () => {
  it("grants users.manage only to SUPER_ADMIN", () => {
    expect(can("SUPER_ADMIN", "users.manage")).toBe(true);
    expect(can("OWNER", "users.manage")).toBe(false);
    expect(can("STAFF", "users.manage")).toBe(false);
  });

  it("lets every signed-in role view the dashboard", () => {
    for (const role of ["SUPER_ADMIN", "OWNER", "STAFF", "CUSTOMER", "AFFILIATE"] as const) {
      expect(can(role, "dashboard.view")).toBe(true);
    }
  });

  it("denies everything for a null role", () => {
    expect(can(null, "dashboard.view")).toBe(false);
  });
});

describe("hasAtLeast / isOneOf", () => {
  it("ranks SUPER_ADMIN above OWNER above STAFF", () => {
    expect(hasAtLeast("SUPER_ADMIN", "OWNER")).toBe(true);
    expect(hasAtLeast("STAFF", "OWNER")).toBe(false);
    expect(hasAtLeast("OWNER", "OWNER")).toBe(true);
  });

  it("isOneOf checks membership in an allow-list", () => {
    expect(isOneOf("STAFF", ["OWNER", "STAFF"])).toBe(true);
    expect(isOneOf("CUSTOMER", ["OWNER", "STAFF"])).toBe(false);
  });
});

describe("workspace roles — canInWorkspace()", () => {
  it("only OWNER can delete a workspace", () => {
    expect(canInWorkspace("OWNER", "workspace.delete")).toBe(true);
    expect(canInWorkspace("ADMIN", "workspace.delete")).toBe(false);
  });

  it("OWNER and ADMIN can manage members; EDITOR/VIEWER cannot", () => {
    expect(canInWorkspace("OWNER", "members.manage")).toBe(true);
    expect(canInWorkspace("ADMIN", "members.manage")).toBe(true);
    expect(canInWorkspace("EDITOR", "members.manage")).toBe(false);
    expect(canInWorkspace("VIEWER", "members.manage")).toBe(false);
  });

  it("EDITOR can edit content but VIEWER is read-only", () => {
    expect(canInWorkspace("EDITOR", "content.edit")).toBe(true);
    expect(canInWorkspace("VIEWER", "content.edit")).toBe(false);
    expect(canInWorkspace("VIEWER", "content.view")).toBe(true);
  });
});

describe("memberHasAtLeast / assignableMemberRoles", () => {
  it("ranks workspace roles correctly", () => {
    expect(memberHasAtLeast("ADMIN", "EDITOR")).toBe(true);
    expect(memberHasAtLeast("VIEWER", "EDITOR")).toBe(false);
  });

  it("OWNER may assign Admin/Editor/Viewer but not Owner", () => {
    expect(assignableMemberRoles("OWNER")).toEqual(["ADMIN", "EDITOR", "VIEWER"]);
  });

  it("ADMIN may assign only Editor/Viewer", () => {
    expect(assignableMemberRoles("ADMIN")).toEqual(["EDITOR", "VIEWER"]);
  });

  it("EDITOR and VIEWER may assign nobody", () => {
    expect(assignableMemberRoles("EDITOR")).toEqual([]);
    expect(assignableMemberRoles("VIEWER")).toEqual([]);
  });

  it("only manages strictly lower workspace roles", () => {
    expect(canManageMember("OWNER", "ADMIN")).toBe(true);
    expect(canManageMember("ADMIN", "EDITOR")).toBe(true);
    expect(canManageMember("ADMIN", "ADMIN")).toBe(false);
    expect(canManageMember("ADMIN", "OWNER")).toBe(false);
    expect(canManageMember("EDITOR", "VIEWER")).toBe(false);
  });
});
