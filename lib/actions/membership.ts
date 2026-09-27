"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MembershipStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { slugify } from "@/lib/slug";
import { getUserPlan } from "@/lib/saas-limits";
import {
  activateMembership,
  extendMembershipGrant,
} from "@/lib/membership-lifecycle";
import { queueMembershipEmailNotification } from "@/lib/store-notifications";
import {
  assignMembershipSchema,
  membershipPlanSchema,
} from "@/lib/zod";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "membership.manage")) return null;
  const plan = await getUserPlan(current.workspace.createdById);
  if (!plan.hasMembership) return null;
  return { workspace: current.workspace, userId: session.user.id };
}

function parsePlan(formData: FormData) {
  return membershipPlanSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: (formData.get("description") as string | null) || undefined,
    level: formData.get("level"),
    price: formData.get("price"),
    accessDays: formData.get("accessDays") || "0",
    isActive: formData.get("isActive") === "true",
    productId: formData.get("productId") || "",
    benefits: formData.get("benefits") || "",
    recommended: formData.get("recommended") === "true",
    ctaLabel: formData.get("ctaLabel") || "",
    sortOrder: formData.get("sortOrder") || "0",
  });
}

function benefitsFrom(value?: string) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

async function validProduct(workspaceId: string, productId?: string) {
  if (!productId) return true;
  return Boolean(
    await prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: { id: true },
    })
  );
}

export async function createMembershipPlanAction(
  formData: FormData
): Promise<ActionResult> {
  const context = await requireEditableWorkspace();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace } = context;

  const parsed = parsePlan(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const slug = slugify(parsed.data.slug);
  if (!(await validProduct(workspace.id, parsed.data.productId))) {
    return { ok: false, error: "Linked product was not found in this workspace." };
  }
  const conflict = await prisma.membershipPlan.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["Already in use."] },
    };
  }

  await prisma.membershipPlan.create({
    data: {
      workspaceId: workspace.id,
      name: parsed.data.name.trim(),
      slug,
      description: parsed.data.description?.trim() || null,
      level: parsed.data.level,
      price: parsed.data.price,
      accessDays: parsed.data.accessDays,
      isActive: parsed.data.isActive,
      productId: parsed.data.productId || null,
      benefits: benefitsFrom(parsed.data.benefits),
      recommended: parsed.data.recommended,
      ctaLabel: parsed.data.ctaLabel?.trim() || null,
      sortOrder: parsed.data.sortOrder,
      archivedAt: null,
    },
  });

  revalidatePath("/dashboard/membership/plans");
  revalidatePath("/dashboard/membership");
  revalidatePath(`/site/${workspace.slug}/memberships`);
  return { ok: true };
}

export async function updateMembershipPlanAction(
  planId: string,
  formData: FormData
): Promise<ActionResult> {
  const context = await requireEditableWorkspace();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace } = context;

  const plan = await prisma.membershipPlan.findUnique({
    where: { id: planId },
    select: { workspaceId: true },
  });
  if (!plan || plan.workspaceId !== workspace.id)
    return { ok: false, error: "Plan not found." };

  const parsed = parsePlan(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const slug = slugify(parsed.data.slug);
  if (!(await validProduct(workspace.id, parsed.data.productId))) {
    return { ok: false, error: "Linked product was not found in this workspace." };
  }
  const conflict = await prisma.membershipPlan.findFirst({
    where: { workspaceId: workspace.id, slug, NOT: { id: planId } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["Already in use."] },
    };
  }

  await prisma.membershipPlan.update({
    where: { id: planId },
    data: {
      name: parsed.data.name.trim(),
      slug,
      description: parsed.data.description?.trim() || null,
      level: parsed.data.level,
      price: parsed.data.price,
      accessDays: parsed.data.accessDays,
      isActive: parsed.data.isActive,
      productId: parsed.data.productId || null,
      benefits: benefitsFrom(parsed.data.benefits),
      recommended: parsed.data.recommended,
      ctaLabel: parsed.data.ctaLabel?.trim() || null,
      sortOrder: parsed.data.sortOrder,
      archivedAt: null,
    },
  });

  revalidatePath("/dashboard/membership/plans");
  revalidatePath("/dashboard/membership");
  revalidatePath(`/site/${workspace.slug}/memberships`);
  return { ok: true };
}

export async function deleteMembershipPlanAction(
  planId: string
): Promise<ActionResult> {
  const context = await requireEditableWorkspace();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace } = context;

  const plan = await prisma.membershipPlan.findUnique({
    where: { id: planId },
    select: { workspaceId: true },
  });
  if (!plan || plan.workspaceId !== workspace.id)
    return { ok: false, error: "Plan not found." };

  await prisma.membershipPlan.update({
    where: { id: planId },
    data: { isActive: false, archivedAt: new Date() },
  });
  revalidatePath("/dashboard/membership");
  revalidatePath("/dashboard/membership/plans");
  revalidatePath("/dashboard/membership/members");
  revalidatePath(`/site/${workspace.slug}/memberships`);
  return { ok: true };
}

export async function assignMembershipAction(
  formData: FormData
): Promise<ActionResult> {
  const context = await requireEditableWorkspace();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace, userId } = context;

  const parsed = assignMembershipSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    planId: formData.get("planId"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const plan = await prisma.membershipPlan.findUnique({
    where: { id: parsed.data.planId },
    select: { workspaceId: true, accessDays: true, name: true },
  });
  if (!plan || plan.workspaceId !== workspace.id)
    return { ok: false, error: "Plan not found." };

  const email = parsed.data.email.toLowerCase().trim();
  const customer = await prisma.customer.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email } },
    update: { name: parsed.data.name.trim() },
    create: {
      workspaceId: workspace.id,
      name: parsed.data.name.trim(),
      email,
    },
  });

  const activation = await prisma.$transaction(async (tx) => {
    const membership = await tx.customerMembership.upsert({
      where: {
        customerId_planId: { customerId: customer.id, planId: parsed.data.planId },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        customerId: customer.id,
        planId: parsed.data.planId,
        status: "PENDING",
      },
    });
    return activateMembership(tx, {
      membershipId: membership.id,
      source: "MANUAL",
      actorId: userId,
    });
  });
  queueMembershipEmailNotification(prisma, {
    workspaceId: workspace.id,
    customerId: customer.id,
    recipient: customer.email,
    event: activation.renewed ? "MEMBERSHIP_RENEWED" : "MEMBERSHIP_WELCOME",
    subject: activation.renewed ? `Access renewed: ${plan.name}` : `Welcome to ${plan.name}`,
    body: `Hi ${customer.name}, your ${plan.name} access is now active.`,
  }).catch((error) => console.warn("Membership assignment email failed", error));

  revalidatePath("/dashboard/membership/members");
  revalidatePath("/dashboard/membership");
  revalidatePath(`/site/${workspace.slug}/memberships`);
  return { ok: true };
}

export async function setMembershipStatusAction(
  membershipId: string,
  status: MembershipStatus
): Promise<ActionResult> {
  const context = await requireEditableWorkspace();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace, userId } = context;

  const membership = await prisma.customerMembership.findUnique({
    where: { id: membershipId },
    select: { workspaceId: true },
  });
  if (!membership || membership.workspaceId !== workspace.id)
    return { ok: false, error: "Membership not found." };

  await prisma.$transaction(async (tx) => {
    await tx.customerMembership.update({
      where: { id: membershipId },
      data: {
        status,
        cancelledAt: status === "CANCELLED" ? new Date() : null,
        cancelAtPeriodEnd: false,
      },
    });
    await tx.membershipEvent.create({
      data: {
        workspaceId: workspace.id,
        membershipId,
        type: status === "EXPIRED" ? "EXPIRED" : status === "CANCELLED" ? "CANCELLED" : "ACTIVATED",
        actorId: userId,
        detail: { status },
      },
    });
  });

  revalidatePath("/dashboard/membership/members");
  revalidatePath("/dashboard/membership");
  revalidatePath(`/site/${workspace.slug}/memberships`);
  return { ok: true };
}

export async function extendMembershipAction(
  membershipId: string,
  days: number
): Promise<ActionResult> {
  const context = await requireEditableWorkspace();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace, userId } = context;

  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    return { ok: false, error: "Invalid extension length." };
  }

  const membership = await prisma.customerMembership.findUnique({
    where: { id: membershipId },
    select: { workspaceId: true, expiresAt: true },
  });
  if (!membership || membership.workspaceId !== workspace.id) {
    return { ok: false, error: "Membership not found." };
  }

  await prisma.$transaction((tx) =>
    extendMembershipGrant(tx, { membershipId, days, actorId: userId })
  );

  revalidatePath("/dashboard/membership/members");
  revalidatePath("/dashboard/membership");
  revalidatePath(`/site/${workspace.slug}/memberships`);
  return { ok: true };
}

export async function removeMembershipAction(
  membershipId: string
): Promise<ActionResult> {
  const context = await requireEditableWorkspace();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace, userId } = context;

  const membership = await prisma.customerMembership.findUnique({
    where: { id: membershipId },
    select: { workspaceId: true },
  });
  if (!membership || membership.workspaceId !== workspace.id)
    return { ok: false, error: "Membership not found." };

  await prisma.$transaction(async (tx) => {
    await tx.customerMembership.update({
      where: { id: membershipId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelAtPeriodEnd: false,
        cancellationReason: "Cancelled by workspace administrator",
      },
    });
    await tx.membershipEvent.create({
      data: {
        workspaceId: workspace.id,
        membershipId,
        type: "CANCELLED",
        actorId: userId,
      },
    });
  });
  revalidatePath("/dashboard/membership/members");
  revalidatePath("/dashboard/membership");
  revalidatePath(`/site/${workspace.slug}/memberships`);
  return { ok: true };
}
