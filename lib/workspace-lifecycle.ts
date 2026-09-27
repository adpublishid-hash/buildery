import "server-only";

import { prisma } from "@/lib/prisma";
import { pruneOrdersByPlan } from "@/lib/order-retention";

export async function sweepWorkspaceLifecycle(now = new Date()) {
  const prunedOrders = await pruneOrdersByPlan(now);
  const expired = await prisma.workspaceInvitation.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  const due = await prisma.workspace.findMany({
    where: { status: "PENDING_DELETION", deleteAfter: { lte: now } },
    select: { id: true },
    take: 50,
  });
  if (due.length) {
    await prisma.workspace.deleteMany({ where: { id: { in: due.map((row) => row.id) } } });
  }
  // Workspace ownership is the restrictive relation on User, so purge due
  // workspaces first and accounts second in the same recurring lifecycle run.
  const dueUsers = await prisma.user.findMany({
    where: { deletedAt: { not: null }, deleteAfter: { lte: now } },
    select: { id: true },
    take: 50,
  });
  if (dueUsers.length) {
    await prisma.user.deleteMany({ where: { id: { in: dueUsers.map((row) => row.id) } } });
  }
  return { expiredInvitations: expired.count, purgedWorkspaces: due.length, purgedUsers: dueUsers.length, purgedOrders: prunedOrders.deleted };
}
