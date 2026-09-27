import "server-only";

import type { Role } from "@prisma/client";

export const SUPER_ADMIN_EMAIL = "wahib.chelsea@gmail.com";

export function getSuperAdminEmails() {
  const configured = process.env.SUPER_ADMIN_EMAILS
    ?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return configured?.length ? configured : [SUPER_ADMIN_EMAIL];
}

export function isSuperAdminEmail(email: string | null | undefined) {
  return Boolean(
    email && getSuperAdminEmails().includes(email.trim().toLowerCase())
  );
}

export function resolveSystemRole(email: string | null | undefined, role: Role) {
  if (isSuperAdminEmail(email)) return "SUPER_ADMIN" satisfies Role;
  return role === "SUPER_ADMIN" ? ("OWNER" satisfies Role) : role;
}
