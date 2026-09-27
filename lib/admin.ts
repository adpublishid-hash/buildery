import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { isSuperAdminEmail } from "@/lib/super-admin";

/**
 * Server-side guard for the /admin area. Redirects non-super-admins to
 * the dashboard. Returns the resolved session user for convenience.
 */
export async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (
    session.user.role !== "SUPER_ADMIN" ||
    !isSuperAdminEmail(session.user.email)
  ) {
    redirect("/dashboard");
  }
  return session.user;
}
