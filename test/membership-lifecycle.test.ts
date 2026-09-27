import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  activateMembership,
  extendMembershipGrant,
  membershipExpiry,
} from "@/lib/membership-lifecycle";
import { getActiveMembershipLevel } from "@/lib/membership";

let ownerId = "";
let workspaceId = "";
let customerId = "";
let planId = "";
let membershipId = "";

beforeAll(async () => {
  const tag = `membership-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;
  const customer = await prisma.customer.create({
    data: { workspaceId, name: "Membership Test", email: `${tag}-member@buildery.test` },
  });
  customerId = customer.id;
  const plan = await prisma.membershipPlan.create({
    data: { workspaceId, name: "Basic 30", slug: "basic-30", level: "BASIC", accessDays: 30, price: 100_000 },
  });
  planId = plan.id;
  const membership = await prisma.customerMembership.create({
    data: { workspaceId, customerId, planId, status: "PENDING" },
  });
  membershipId = membership.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("membership lifecycle", () => {
  it("calculates lifetime and finite access without shortening remaining time", () => {
    const now = new Date("2026-09-18T00:00:00.000Z");
    expect(membershipExpiry(0, null, now)).toBeNull();
    expect(membershipExpiry(30, null, now)?.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(membershipExpiry(30, new Date("2026-10-01T00:00:00.000Z"), now)?.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("activates access and records an immutable grant and event", async () => {
    const now = new Date("2026-09-18T00:00:00.000Z");
    await prisma.$transaction((tx) => activateMembership(tx, { membershipId, source: "MANUAL", now }));
    const membership = await prisma.customerMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { grants: true, events: true },
    });
    expect(membership.status).toBe("ACTIVE");
    expect(membership.expiresAt?.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(membership.grants).toHaveLength(1);
    expect(membership.events.map((event) => event.type)).toContain("ACTIVATED");
    expect(await getActiveMembershipLevel(workspaceId, customerId)).toBe("BASIC");
  });

  it("extends from the current end date and preserves prior grants", async () => {
    await prisma.$transaction((tx) => extendMembershipGrant(tx, {
      membershipId,
      days: 30,
      now: new Date("2026-09-20T00:00:00.000Z"),
    }));
    const membership = await prisma.customerMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { grants: { orderBy: { createdAt: "asc" } }, events: true },
    });
    expect(membership.expiresAt?.toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(membership.grants).toHaveLength(2);
    expect(membership.events.map((event) => event.type)).toContain("EXTENDED");
  });

  it("does not duplicate a payment-backed renewal grant", async () => {
    const payment = await prisma.payment.create({
      data: {
        workspaceId,
        customerMembershipId: membershipId,
        kind: "MEMBERSHIP",
        status: "PAID",
        amount: 100_000,
        midtransOrderId: `membership-test-${Date.now()}`,
      },
    });
    const now = new Date("2026-09-22T00:00:00.000Z");
    await prisma.$transaction((tx) => activateMembership(tx, { membershipId, source: "RENEWAL", paymentId: payment.id, amount: payment.amount, now }));
    const afterFirst = await prisma.customerMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { expiresAt: true } });
    await prisma.$transaction((tx) => activateMembership(tx, { membershipId, source: "RENEWAL", paymentId: payment.id, amount: payment.amount, now }));
    const afterDuplicate = await prisma.customerMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { expiresAt: true } });
    expect(await prisma.membershipGrant.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(afterDuplicate.expiresAt).toEqual(afterFirst.expiresAt);
  });
});
