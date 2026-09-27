import "server-only";

import type { MembershipLevel } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Re-export so server callers can keep importing from "@/lib/membership".
export { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";

const RANK: Record<MembershipLevel, number> = {
  FREE: 0,
  BASIC: 10,
  PREMIUM: 20,
};

export function levelMeets(
  actual: MembershipLevel | undefined | null,
  required: MembershipLevel
) {
  if (!actual) return required === "FREE";
  return RANK[actual] >= RANK[required];
}

/**
 * Returns the highest active membership level for a given customer in a
 * workspace, or null when there's no active membership. Used to gate
 * access to premium content like paid courses.
 */
export async function getActiveMembershipLevel(
  workspaceId: string,
  customerId: string
): Promise<MembershipLevel | null> {
  const memberships = await prisma.customerMembership.findMany({
    where: {
      workspaceId,
      customerId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { plan: { select: { level: true } } },
  });
  if (memberships.length === 0) return null;
  return memberships
    .map((m) => m.plan.level)
    .reduce((best, lvl) => (RANK[lvl] > RANK[best] ? lvl : best));
}

export async function hasRequiredMembership(
  workspaceId: string,
  customerId: string,
  required: MembershipLevel
) {
  if (required === "FREE") return true;
  return levelMeets(
    await getActiveMembershipLevel(workspaceId, customerId),
    required
  );
}
