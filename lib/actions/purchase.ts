"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { generateMidtransOrderId } from "@/lib/payments";
import { assignMembershipSchema } from "@/lib/zod";
import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";
import {
  requestAdContext,
  sendWorkspaceAdEvent,
  toStoredAdContext,
} from "@/lib/ad-events";
import { splitName } from "@/lib/ad-match";
import { DEFAULT_AD_CURRENCY } from "@/lib/ad-catalog";
import { getMemberSession } from "@/lib/member-auth";
import { publicSiteHref } from "@/lib/public-url";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { issuePublicAccessToken } from "@/lib/public-access-token";
import {
  getOrCreateEcommerceSetting,
  getPaymentExpiry,
} from "@/lib/ecommerce-settings";
import { rateLimitByIp } from "@/lib/rate-limit";
import { activateMembership } from "@/lib/membership-lifecycle";
import { getUserPlan } from "@/lib/saas-limits";
import { queueMembershipEmailNotification } from "@/lib/store-notifications";
import { getActiveAffiliateFor } from "@/lib/affiliate";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type PurchaseResult =
  | { mode: "joined" | "renewed"; metaEvent?: MetaActionEvent }
  | {
      mode: "payment";
      paymentId: string;
      paymentAccessToken: string;
      metaEvent?: MetaActionEvent;
    };

type MetaActionEvent = {
  eventName: MetaStandardEventName;
  eventId: string;
  customData: MetaCustomData;
};

/**
 * Public membership purchase. Free plans activate instantly; paid plans
 * create a PENDING membership + payment for the Midtrans flow.
 */
export async function purchaseMembershipAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<PurchaseResult>> {
  const throttle = await rateLimitByIp(
    `membership-checkout:${workspaceSlug}`,
    8,
    10 * 60 * 1000
  );
  if (!throttle.ok) {
    return { ok: false, error: "Too many attempts. Please try again shortly." };
  }
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

  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "ACTIVE" },
    select: { id: true, createdById: true },
  });
  if (!workspace) return { ok: false, error: "Workspace not found." };
  if (!(await getUserPlan(workspace.createdById)).hasMembership) {
    return { ok: false, error: "Membership checkout is currently unavailable." };
  }

  const plan = await prisma.membershipPlan.findUnique({
    where: { id: parsed.data.planId },
    select: {
      id: true,
      name: true,
      price: true,
      level: true,
      isActive: true,
      workspaceId: true,
      accessDays: true,
    },
  });
  if (!plan || plan.workspaceId !== workspace.id || !plan.isActive) {
    return { ok: false, error: "This plan is not available." };
  }

  const member = await getMemberSession(workspaceSlug);
  if (!member || member.workspaceId !== workspace.id) {
    return {
      ok: false,
      error: "Please create a member account or log in before joining a plan.",
    };
  }
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: member.customerId },
  });

  const now = new Date();
  const setting = plan.price > 0
    ? await getOrCreateEcommerceSetting(workspace.id)
    : null;
  const adContext = requestAdContext(publicSiteHref(workspaceSlug, "memberships"));
  const attribution = await getActiveAffiliateFor(workspace.id);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${customer.id}:${plan.id}`}))`;
    const existing = await tx.customerMembership.findUnique({
      where: {
        customerId_planId: { customerId: customer.id, planId: plan.id },
      },
      include: {
        payments: {
          where: { status: "PENDING", expiresAt: { gt: now } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const active = Boolean(
      existing?.status === "ACTIVE" &&
        (!existing.expiresAt || existing.expiresAt > now)
    );
    if (active && existing?.expiresAt === null) {
      return { kind: "joined" as const, membership: existing, notify: false };
    }
    if (active && plan.price <= 0) {
      return { kind: "joined" as const, membership: existing!, notify: false };
    }
    if (plan.price <= 0) {
      const membership = existing ?? await tx.customerMembership.create({
        data: {
          workspaceId: workspace.id,
          customerId: customer.id,
          planId: plan.id,
          status: "PENDING",
        },
      });
      await activateMembership(tx, {
        membershipId: membership.id,
        source: active ? "RENEWAL" : "FREE_JOIN",
      });
      return { kind: active ? "renewed" as const : "joined" as const, membership, notify: true };
    }
    const pendingPayment = existing?.payments[0];
    if (pendingPayment) {
      return { kind: "payment" as const, membership: existing, payment: pendingPayment, notify: false };
    }
    const membership = existing
      ? await tx.customerMembership.update({
          where: { id: existing.id },
          data: active ? {} : { status: "PENDING" },
        })
      : await tx.customerMembership.create({
          data: {
            workspaceId: workspace.id,
            customerId: customer.id,
            planId: plan.id,
            status: "PENDING",
          },
        });
    const payment = await tx.payment.create({
      data: {
        workspaceId: workspace.id,
        customerMembershipId: membership.id,
        membershipRenewal: active,
        kind: "MEMBERSHIP",
        status: "PENDING",
        amount: plan.price,
        midtransOrderId: generateMidtransOrderId("BDM"),
        description: `${active ? "Membership renewal" : "Membership access"}: ${plan.name}`,
        expiresAt: getPaymentExpiry(setting!),
        adContext: toStoredAdContext(adContext),
        referralAffiliateId: attribution?.affiliateId ?? null,
      },
    });
    return { kind: "payment" as const, membership, payment, notify: false };
  });

  if (result.kind === "joined" || result.kind === "renewed") {
    const membership = result.membership;
    const metaEvent = {
      eventName: "CompleteRegistration" as const,
      eventId: `complete_registration:membership:${membership.id}`,
      customData: { ...buildMembershipMetaData(plan), status: "active" },
    };
    sendWorkspaceAdEvent(workspace.id, {
      ...metaEvent,
      ...requestAdContext(publicSiteHref(workspaceSlug, "memberships")),
      customerData: {
        email: customer.email,
        phone: customer.phone,
        ...splitName(customer.name),
        externalId: customer.id,
      },
    }).catch((error) => {
      console.warn("Ad event membership CompleteRegistration failed", error);
    });
    if (result.notify) {
      queueMembershipEmailNotification(prisma, {
        workspaceId: workspace.id,
        customerId: customer.id,
        recipient: customer.email,
        event: result.kind === "renewed" ? "MEMBERSHIP_RENEWED" : "MEMBERSHIP_WELCOME",
        subject: result.kind === "renewed" ? `Access renewed: ${plan.name}` : `Welcome to ${plan.name}`,
        body: `Hi ${customer.name}, your ${plan.name} access is now active.`,
      }).catch((error) => console.warn("Membership email failed", error));
    }
    revalidatePath(`/site/${workspaceSlug}/memberships`);
    return { ok: true, data: { mode: result.kind, metaEvent } };
  }
  const membership = result.membership;
  const payment = result.payment;
  if (!payment) return { ok: false, error: "Unable to create payment." };

  const metaEvent = {
    eventName: "InitiateCheckout" as const,
    eventId: `initiate_checkout:membership:${membership.id}`,
    customData: { ...buildMembershipMetaData(plan), status: "pending" },
  };
  sendWorkspaceAdEvent(workspace.id, {
    ...metaEvent,
    ...adContext,
    customerData: {
      email: customer.email,
      phone: customer.phone,
      ...splitName(customer.name),
      externalId: customer.id,
    },
  }).catch((error) => {
    console.warn("Ad event membership InitiateCheckout failed", error);
  });

  revalidatePath(`/site/${workspaceSlug}/memberships`);
  return {
    ok: true,
    data: {
      mode: "payment",
      paymentId: payment.id,
      paymentAccessToken: issuePublicAccessToken("payment", payment.id),
      metaEvent,
    },
  };
}

function buildMembershipMetaData(plan: {
  id: string;
  name: string;
  level: keyof typeof MEMBERSHIP_LEVEL_LABEL;
  price: number;
}): MetaCustomData {
  return {
    content_ids: [plan.id],
    content_name: plan.name,
    content_type: "membership",
    content_category: MEMBERSHIP_LEVEL_LABEL[plan.level],
    contents: [{ id: plan.id, quantity: 1, item_price: plan.price }],
    currency: DEFAULT_AD_CURRENCY,
    value: plan.price,
  };
}
