import "server-only";

import { cache } from "react";
import type { SaaSPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isSubscriptionEntitled } from "@/lib/billing-pricing";

export type SaaSFeature =
  | "affiliate"
  | "membership"
  | "advancedAnalytics"
  | "aiAssistant";

export type LimitKind = "workspace" | "page" | "product" | "course" | "blog" | "form";

export const LIMIT_LABEL: Record<LimitKind, string> = {
  workspace: "workspace",
  page: "page",
  product: "product",
  course: "course",
  blog: "blog post",
  form: "form",
};

/**
 * Resolves the SaaS plan for a user. If they have no subscription yet, or
 * their subscription no longer entitles them, falls back to the FREE plan.
 * Cached per request.
 *
 * Status alone is not enough: a paid period that ended still carries status
 * ACTIVE until the billing sweep runs, and a subscription inside its grace
 * window carries PAST_DUE while still being entitled. Both cases are decided
 * by isSubscriptionEntitled, which the sweep uses too, so entitlement and
 * lifecycle can never disagree.
 */
// React 18's test/runtime build may not expose cache; server components do.
const requestCache: typeof cache =
  typeof cache === "function"
    ? cache
    : ((fn: Parameters<typeof cache>[0]) => fn) as typeof cache;

export const getUserPlan = requestCache(async (userId: string): Promise<SaaSPlan> => {
  const sub = await prisma.saaSSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
  if (sub && isSubscriptionEntitled(sub)) return sub.plan;

  const free = await prisma.saaSPlan.findUnique({ where: { tier: "FREE" } });
  if (free) return free;

  // Brand-new install: fall back to an in-memory FREE plan so the app
  // doesn't crash before seeds run.
  return {
    id: "no-plan",
    tier: "FREE",
    name: "Free",
    description: null,
    monthlyPrice: 0,
    compareAtMonthlyPrice: null,
    features: [],
    workspaceLimit: 1,
    memberLimit: 2,
    pageLimit: 5,
    productLimit: 5,
    courseLimit: 0,
    hasAffiliate: false,
    hasMembership: false,
    hasAdvancedAnalytics: false,
    hasAiAssistant: false,
    blogPostLimit: null,
    formLimit: 0,
    customerLimit: null,
    monthlyOrderLimit: 100,
    orderRetentionMonths: 2,
    customDomainEnabled: false,
    isPublic: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as SaaSPlan;
});

export function planHasFeature(plan: SaaSPlan, feature: SaaSFeature): boolean {
  switch (feature) {
    case "affiliate":
      return plan.hasAffiliate;
    case "membership":
      return plan.hasMembership;
    case "advancedAnalytics":
      return plan.hasAdvancedAnalytics;
    case "aiAssistant":
      return plan.hasAiAssistant;
  }
}

function limitForKind(plan: SaaSPlan, kind: LimitKind): number | null {
  switch (kind) {
    case "workspace":
      return plan.workspaceLimit;
    case "page":
      return plan.pageLimit;
    case "product":
      return plan.productLimit;
    case "course":
      return plan.courseLimit;
    case "blog":
      return plan.blogPostLimit;
    case "form":
      return plan.formLimit;
  }
}

/**
 * Counts the user's existing resources across the workspaces they own.
 * Owners pay the limit; collaborators don't reduce their own quota.
 */
export async function getCurrentUsage(userId: string, kind: LimitKind) {
  if (kind === "workspace") {
    return prisma.workspace.count({ where: { createdById: userId } });
  }
  const where = { workspace: { createdById: userId } } as const;
  switch (kind) {
    case "page":
      return prisma.page.count({
        where: { website: { workspace: { createdById: userId } } },
      });
    case "product":
      return prisma.product.count({ where });
    case "course":
      return prisma.course.count({ where });
    case "blog":
      return prisma.blogPost.count({ where });
    case "form":
      return prisma.form.count({ where });
  }
}

/**
 * Used by create actions to enforce plan limits.
 * Returns null when allowed, or a friendly error message when at quota.
 */
export async function assertCanCreate(
  userId: string,
  kind: LimitKind
): Promise<string | null> {
  const plan = await getUserPlan(userId);
  const limit = limitForKind(plan, kind);
  if (limit == null) return null;

  const used = await getCurrentUsage(userId, kind);
  if (used >= limit) {
    return `Your ${plan.name} plan allows up to ${limit} ${LIMIT_LABEL[kind]}${
      limit === 1 ? "" : "s"
    }. Upgrade to add more.`;
  }
  return null;
}

/** Checks the account-wide monthly order allowance before checkout writes. */
export async function assertCanAcceptOrder(
  workspaceId: string,
  now = new Date()
): Promise<string | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { createdById: true },
  });
  if (!workspace) return "Workspace not found.";

  const plan = await getUserPlan(workspace.createdById);
  if (plan.monthlyOrderLimit == null) return null;

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const used = await prisma.order.count({
    where: {
      workspace: { createdById: workspace.createdById },
      createdAt: { gte: monthStart },
    },
  });
  if (used < plan.monthlyOrderLimit) return null;
  return `Toko sudah mencapai batas ${plan.monthlyOrderLimit.toLocaleString("id-ID")} order per bulan pada plan ${plan.name}. Upgrade plan untuk menerima order baru.`;
}

/**
 * Kuota plan tujuan yang sudah dilampaui pemakaian saat ini.
 *
 * Downgrade tidak menghapus apa pun — data pelanggan tetap utuh dan hanya
 * pembuatan baru yang terkunci. Tapi itu harus dikatakan sebelum mereka
 * membayar, bukan ditemukan sendiri setelahnya.
 */
export async function getDowngradeWarnings(
  userId: string,
  targetPlan: SaaSPlan
): Promise<string[]> {
  const kinds: LimitKind[] = ["workspace", "page", "product", "course", "blog", "form"];
  const warnings: string[] = [];

  for (const kind of kinds) {
    const limit = limitForKind(targetPlan, kind);
    if (limit == null) continue;

    const used = await getCurrentUsage(userId, kind);
    if (used > limit) {
      warnings.push(
        `${LIMIT_LABEL[kind]}: terpakai ${used}, kuota ${targetPlan.name} ${limit}. ` +
          `Yang sudah ada tetap aman, tapi kamu tidak bisa menambah sampai turun ke ${limit}.`
      );
    }
  }

  return warnings;
}

export type LimitSummary = {
  kind: LimitKind;
  used: number;
  limit: number | null;
  label: string;
};

/** Computes used/limit pairs for every kind — used on the billing page. */
export async function getLimitSummaries(
  userId: string
): Promise<LimitSummary[]> {
  const plan = await getUserPlan(userId);
  const kinds: LimitKind[] = ["workspace", "page", "product", "course", "blog", "form"];
  return Promise.all(
    kinds.map(async (kind) => ({
      kind,
      used: await getCurrentUsage(userId, kind),
      limit: limitForKind(plan, kind),
      label: LIMIT_LABEL[kind] + "s",
    }))
  );
}
