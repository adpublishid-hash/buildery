import type { MemberRole, Role } from "@prisma/client";

// ============================================================
// System-wide roles (from Part 1) — attached to User.role
// ============================================================

export const ROLES: Role[] = [
  "SUPER_ADMIN",
  "OWNER",
  "STAFF",
  "CUSTOMER",
  "AFFILIATE",
];

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  OWNER: "Pemilik",
  STAFF: "Staff",
  CUSTOMER: "Pelanggan",
  AFFILIATE: "Affiliate",
};

const RANK: Record<Role, number> = {
  SUPER_ADMIN: 100,
  OWNER: 80,
  STAFF: 60,
  AFFILIATE: 40,
  CUSTOMER: 20,
};

export function hasAtLeast(role: Role | undefined | null, minimum: Role) {
  if (!role) return false;
  return RANK[role] >= RANK[minimum];
}

export function isOneOf(role: Role | undefined | null, allowed: Role[]) {
  if (!role) return false;
  return allowed.includes(role);
}

export type Permission =
  | "dashboard.view"
  | "users.view"
  | "users.manage"
  | "sites.view"
  | "sites.manage"
  | "billing.view"
  | "billing.manage"
  | "affiliate.view"
  | "workspaces.view";

const PERMISSIONS: Record<Permission, Role[]> = {
  "dashboard.view": ["SUPER_ADMIN", "OWNER", "STAFF", "CUSTOMER", "AFFILIATE"],
  "users.view": ["SUPER_ADMIN", "OWNER"],
  "users.manage": ["SUPER_ADMIN"],
  "sites.view": ["SUPER_ADMIN", "OWNER", "STAFF", "CUSTOMER"],
  "sites.manage": ["SUPER_ADMIN", "OWNER", "STAFF"],
  "billing.view": ["SUPER_ADMIN", "OWNER", "CUSTOMER"],
  "billing.manage": ["SUPER_ADMIN", "OWNER"],
  "affiliate.view": ["SUPER_ADMIN", "OWNER", "AFFILIATE"],
  "workspaces.view": ["SUPER_ADMIN", "OWNER", "STAFF", "CUSTOMER", "AFFILIATE"],
};

export function can(role: Role | undefined | null, permission: Permission) {
  if (!role) return false;
  return PERMISSIONS[permission].includes(role);
}

// ============================================================
// Workspace-level roles (Part 2) — WorkspaceMember.role
// ============================================================

export const MEMBER_ROLES: MemberRole[] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: "Pemilik",
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export const MEMBER_ROLE_DESCRIPTION: Record<MemberRole, string> = {
  OWNER: "Akses penuh, termasuk menghapus workspace dan memindahkan kepemilikan.",
  ADMIN: "Mengelola pengaturan, anggota, integrasi, dan semua konten.",
  EDITOR: "Membuat dan mengedit konten, tanpa akses kelola anggota atau billing.",
  VIEWER: "Akses baca saja untuk melihat data dan konten workspace.",
};

const MEMBER_RANK: Record<MemberRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  EDITOR: 60,
  VIEWER: 20,
};

export function memberRoleRank(role: MemberRole) {
  return MEMBER_RANK[role];
}

export function canManageMember(caller: MemberRole, target: MemberRole) {
  return canInWorkspace(caller, "members.manage") && MEMBER_RANK[caller] > MEMBER_RANK[target];
}

export function memberHasAtLeast(
  role: MemberRole | undefined | null,
  minimum: MemberRole
) {
  if (!role) return false;
  return MEMBER_RANK[role] >= MEMBER_RANK[minimum];
}

export type WorkspacePermission =
  | "workspace.view"
  | "workspace.edit"
  | "workspace.delete"
  | "members.view"
  | "members.invite"
  | "members.manage"
  | "branding.edit"
  | "content.view"
  | "content.edit"
  | "membership.view"
  | "membership.manage"
  | "affiliate.view"
  | "affiliate.manage"
  | "affiliate.payout";

const WORKSPACE_PERMISSIONS: Record<WorkspacePermission, MemberRole[]> = {
  "workspace.view": ["OWNER", "ADMIN", "EDITOR", "VIEWER"],
  "workspace.edit": ["OWNER", "ADMIN"],
  "workspace.delete": ["OWNER"],
  "members.view": ["OWNER", "ADMIN", "EDITOR", "VIEWER"],
  "members.invite": ["OWNER", "ADMIN"],
  "members.manage": ["OWNER", "ADMIN"],
  "branding.edit": ["OWNER", "ADMIN"],
  "content.view": ["OWNER", "ADMIN", "EDITOR", "VIEWER"],
  "content.edit": ["OWNER", "ADMIN", "EDITOR"],
  "membership.view": ["OWNER", "ADMIN"],
  "membership.manage": ["OWNER", "ADMIN"],
  "affiliate.view": ["OWNER", "ADMIN", "VIEWER"],
  "affiliate.manage": ["OWNER", "ADMIN"],
  "affiliate.payout": ["OWNER", "ADMIN"],
};

export function canInWorkspace(
  role: MemberRole | undefined | null,
  permission: WorkspacePermission
) {
  if (!role) return false;
  return WORKSPACE_PERMISSIONS[permission].includes(role);
}

// Returns the list of roles a caller may assign. An OWNER may not be assigned
// arbitrarily — ownership transfer is a separate, deliberate action.
export function assignableMemberRoles(
  callerRole: MemberRole | undefined | null
): MemberRole[] {
  if (callerRole === "OWNER") return ["ADMIN", "EDITOR", "VIEWER"];
  if (callerRole === "ADMIN") return ["EDITOR", "VIEWER"];
  return [];
}
