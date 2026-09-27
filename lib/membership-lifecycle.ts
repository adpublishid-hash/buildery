import "server-only";

import type {
  MembershipEventType,
  MembershipGrantSource,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { queueMembershipEmailNotification } from "@/lib/store-notifications";

type Tx = Prisma.TransactionClient | PrismaClient;

export function membershipExpiry(
  accessDays: number,
  current: Date | null = null,
  now = new Date()
) {
  if (accessDays === 0) return null;
  const base = current && current > now ? new Date(current) : new Date(now);
  base.setUTCDate(base.getUTCDate() + accessDays);
  return base;
}

export async function activateMembership(
  tx: Tx,
  input: {
    membershipId: string;
    source: MembershipGrantSource;
    paymentId?: string | null;
    amount?: number;
    actorId?: string | null;
    now?: Date;
    metadata?: Prisma.InputJsonValue;
  }
) {
  const now = input.now ?? new Date();
  const membership = await tx.customerMembership.findUniqueOrThrow({
    where: { id: input.membershipId },
    include: { plan: true, customer: true },
  });
  const existingGrant = input.paymentId
    ? await tx.membershipGrant.findUnique({
        where: { paymentId: input.paymentId },
        select: { id: true },
      })
    : null;
  if (existingGrant) {
    return {
      membership,
      customer: membership.customer,
      plan: membership.plan,
      renewed: input.source === "RENEWAL",
    };
  }
  const wasActive =
    membership.status === "ACTIVE" &&
    (!membership.expiresAt || membership.expiresAt > now);
  const renewing = input.source === "RENEWAL" || wasActive;
  const expiresAt = membershipExpiry(
    membership.plan.accessDays,
    renewing ? membership.expiresAt : null,
    now
  );
  const eventType: MembershipEventType = renewing ? "RENEWED" : "ACTIVATED";

  const updated = await tx.customerMembership.update({
    where: { id: membership.id },
    data: {
      status: "ACTIVE",
      startedAt: renewing ? membership.startedAt : now,
      expiresAt,
      lastRenewedAt: renewing ? now : membership.lastRenewedAt,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      cancellationReason: null,
      reminder14At: null,
      reminder7At: null,
      reminder1At: null,
    },
  });

  await tx.membershipGrant.create({
    data: {
      workspaceId: membership.workspaceId,
      membershipId: membership.id,
      paymentId: input.paymentId ?? null,
      source: renewing ? "RENEWAL" : input.source,
      startsAt: now,
      expiresAt,
      amount: input.amount ?? 0,
      metadata: input.metadata,
    },
  });
  await tx.membershipEvent.create({
    data: {
      workspaceId: membership.workspaceId,
      membershipId: membership.id,
      type: eventType,
      actorId: input.actorId ?? null,
      detail: { source: input.source, paymentId: input.paymentId ?? null },
    },
  });

  return {
    membership: updated,
    customer: membership.customer,
    plan: membership.plan,
    renewed: renewing,
  };
}

export async function extendMembershipGrant(
  tx: Tx,
  input: {
    membershipId: string;
    days: number;
    actorId?: string | null;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const current = await tx.customerMembership.findUniqueOrThrow({
    where: { id: input.membershipId },
  });
  const expiresAt = membershipExpiry(input.days, current.expiresAt, now);
  const membership = await tx.customerMembership.update({
    where: { id: current.id },
    data: {
      status: "ACTIVE",
      expiresAt,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      cancellationReason: null,
      reminder14At: null,
      reminder7At: null,
      reminder1At: null,
    },
  });
  await tx.membershipGrant.create({
    data: {
      workspaceId: current.workspaceId,
      membershipId: current.id,
      source: "MANUAL",
      startsAt: now,
      expiresAt,
      metadata: { days: input.days },
    },
  });
  await tx.membershipEvent.create({
    data: {
      workspaceId: current.workspaceId,
      membershipId: current.id,
      type: "EXTENDED",
      actorId: input.actorId ?? null,
      detail: { days: input.days, expiresAt: expiresAt?.toISOString() ?? null },
    },
  });
  return membership;
}

export async function sweepMembershipLifecycle(options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const expired = await prisma.customerMembership.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    include: { customer: true, plan: true },
    take: 500,
  });
  let expiredCount = 0;
  let reminded = 0;

  for (const membership of expired) {
    const changed = await prisma.customerMembership.updateMany({
      where: { id: membership.id, status: "ACTIVE", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    if (!changed.count) continue;
    expiredCount += 1;
    await prisma.membershipEvent.create({
      data: {
        workspaceId: membership.workspaceId,
        membershipId: membership.id,
        type: "EXPIRED",
      },
    });
    await queueMembershipEmailNotification(prisma, {
      workspaceId: membership.workspaceId,
      customerId: membership.customerId,
      recipient: membership.customer.email,
      event: "MEMBERSHIP_EXPIRED",
      subject: `Access expired: ${membership.plan.name}`,
      body: `Hi ${membership.customer.name}, your access to ${membership.plan.name} has ended. You can renew it from your member account.`,
    });
  }

  const upcoming = await prisma.customerMembership.findMany({
    where: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      expiresAt: { gt: now, lte: addDays(now, 14) },
    },
    include: { customer: true, plan: true },
    take: 500,
  });
  for (const membership of upcoming) {
    const days = Math.ceil(
      (membership.expiresAt!.getTime() - now.getTime()) / 86_400_000
    );
    const reminder = days <= 1 ? "reminder1At" : days <= 7 ? "reminder7At" : "reminder14At";
    if (membership[reminder]) continue;
    const changed = await prisma.customerMembership.updateMany({
      where: { id: membership.id, [reminder]: null },
      data: { [reminder]: now },
    });
    if (!changed.count) continue;
    reminded += 1;
    await queueMembershipEmailNotification(prisma, {
      workspaceId: membership.workspaceId,
      customerId: membership.customerId,
      recipient: membership.customer.email,
      event: "MEMBERSHIP_EXPIRING",
      subject: `${membership.plan.name} expires in ${days} day${days === 1 ? "" : "s"}`,
      body: `Hi ${membership.customer.name}, renew your access before ${membership.expiresAt!.toLocaleDateString("id-ID")} to keep using member benefits.`,
    });
  }
  return { expired: expiredCount, reminded };
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86_400_000);
}
