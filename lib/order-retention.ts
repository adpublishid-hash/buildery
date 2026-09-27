import "server-only";

import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/saas-limits";

/** Deletes order records older than each workspace owner's plan allows. */
export async function pruneOrdersByPlan(now = new Date()) {
  const workspaces = await prisma.workspace.findMany({
    where: { status: { not: "PENDING_DELETION" } },
    select: { id: true, createdById: true },
  });
  const planByOwner = new Map<string, Awaited<ReturnType<typeof getUserPlan>>>();
  let deleted = 0;

  for (const workspace of workspaces) {
    let plan = planByOwner.get(workspace.createdById);
    if (!plan) {
      plan = await getUserPlan(workspace.createdById);
      planByOwner.set(workspace.createdById, plan);
    }
    if (plan.orderRetentionMonths == null) continue;

    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - plan.orderRetentionMonths);
    const result = await prisma.order.deleteMany({
      where: { workspaceId: workspace.id, createdAt: { lt: cutoff } },
    });
    deleted += result.count;
  }

  return { deleted };
}
