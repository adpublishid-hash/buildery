"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

/** The notifications the topbar bell lists: order notices and low-stock alerts. */
const BELL_SCOPE = {
  OR: [{ orderId: { not: null } }, { event: "LOW_STOCK_ALERT" as const }],
};

/**
 * Hides notifications from the topbar bell. Clearing is only about the bell:
 * the rows stay for the audit trail, and a failed notice keeps being retried.
 */
export async function clearStoreNotificationsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const scope = String(formData.get("scope") ?? "all");
  const notificationId = String(formData.get("notificationId") ?? "");

  const current = await getCurrentWorkspace(session.user.id);
  if (
    !current ||
    current.workspace.id !== workspaceId ||
    !canInWorkspace(current.role, "content.view")
  ) {
    return;
  }

  const base = { workspaceId: current.workspace.id, clearedAt: null, ...BELL_SCOPE };
  const where =
    scope === "single" && notificationId
      ? { ...base, id: notificationId }
      : scope === "attention"
        ? { ...base, status: { in: ["QUEUED" as const, "FAILED" as const] } }
        : base;

  await prisma.storeNotification.updateMany({ where, data: { clearedAt: new Date() } });

  revalidatePath("/dashboard", "layout");
}
