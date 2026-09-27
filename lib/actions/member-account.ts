"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { getMemberSession, setMemberSession } from "@/lib/member-auth";
import { prisma } from "@/lib/prisma";
import { queueMembershipEmailNotification } from "@/lib/store-notifications";

type Result = { ok: true } | { ok: false; error: string };

export async function updateMemberProfileAction(
  workspaceSlug: string,
  formData: FormData
): Promise<Result> {
  const member = await getMemberSession(workspaceSlug);
  if (!member) return { ok: false, error: "Please log in again." };
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Name must be between 2 and 80 characters." };
  }
  if (phone.length > 30) return { ok: false, error: "Phone number is too long." };
  await prisma.customer.update({
    where: { id: member.customerId },
    data: { name, phone: phone || null },
  });
  revalidatePath(`/site/${workspaceSlug}/member/account`);
  return { ok: true };
}

export async function changeMemberPasswordAction(
  workspaceSlug: string,
  formData: FormData
): Promise<Result> {
  const member = await getMemberSession(workspaceSlug);
  if (!member) return { ok: false, error: "Please log in again." };
  const currentPassword = String(formData.get("currentPassword") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 8 || password.length > 72) {
    return { ok: false, error: "New password must be 8 to 72 characters." };
  }
  const customer = await prisma.customer.findUnique({
    where: { id: member.customerId },
    select: { password: true, sessionVersion: true },
  });
  if (!customer?.password || !(await bcrypt.compare(currentPassword, customer.password))) {
    return { ok: false, error: "Current password is incorrect." };
  }
  const nextVersion = customer.sessionVersion + 1;
  await prisma.customer.update({
    where: { id: member.customerId },
    data: {
      password: await bcrypt.hash(password, 10),
      sessionVersion: nextVersion,
    },
  });
  await setMemberSession({
    workspaceId: member.workspaceId,
    customerId: member.customerId,
    version: nextVersion,
  });
  return { ok: true };
}

export async function cancelMemberAccessAction(
  workspaceSlug: string,
  membershipId: string
): Promise<Result> {
  const member = await getMemberSession(workspaceSlug);
  if (!member) return { ok: false, error: "Please log in again." };
  const membership = await prisma.customerMembership.findFirst({
    where: {
      id: membershipId,
      workspaceId: member.workspaceId,
      customerId: member.customerId,
      status: "ACTIVE",
    },
    include: { plan: true, customer: true },
  });
  if (!membership) return { ok: false, error: "Active membership was not found." };
  const immediate = membership.expiresAt === null;
  await prisma.$transaction(async (tx) => {
    await tx.customerMembership.update({
      where: { id: membership.id },
      data: immediate
        ? {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancellationReason: "Cancelled by member",
          }
        : {
            cancelAtPeriodEnd: true,
            cancelledAt: new Date(),
            cancellationReason: "Cancellation requested by member",
          },
    });
    await tx.membershipEvent.create({
      data: {
        workspaceId: membership.workspaceId,
        membershipId: membership.id,
        type: "CANCELLED",
        detail: { immediate },
      },
    });
    await queueMembershipEmailNotification(tx, {
      workspaceId: membership.workspaceId,
      customerId: membership.customerId,
      recipient: membership.customer.email,
      event: "MEMBERSHIP_CANCELLED",
      subject: `Cancellation confirmed: ${membership.plan.name}`,
      body: immediate
        ? `Your ${membership.plan.name} access has been cancelled.`
        : `Your ${membership.plan.name} access remains available until ${membership.expiresAt!.toLocaleDateString("id-ID")}.`,
    });
  });
  revalidatePath(`/site/${workspaceSlug}/member/account`);
  return { ok: true };
}
