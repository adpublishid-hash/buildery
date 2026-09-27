"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AbandonedRecoveryStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { queueWhatsAppInboxMessage } from "@/lib/ecommerce-integration";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace;
}

async function getOrder(workspaceId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, workspaceId },
    include: { customer: true },
  });
}

async function upsertRecovery(
  workspaceId: string,
  orderId: string,
  data: {
    status: AbandonedRecoveryStatus;
    attempts?: { increment: number };
    lastContactedAt?: Date | null;
    snoozedUntil?: Date | null;
    recoveredAt?: Date | null;
    ignoredAt?: Date | null;
    note?: string | null;
  }
) {
  return prisma.abandonedCheckoutRecovery.upsert({
    where: { orderId },
    update: data,
    create: {
      workspaceId,
      orderId,
      status: data.status,
      attempts: data.attempts?.increment ?? 0,
      lastContactedAt: data.lastContactedAt,
      snoozedUntil: data.snoozedUntil,
      recoveredAt: data.recoveredAt,
      ignoredAt: data.ignoredAt,
      note: data.note,
    },
  });
}

export async function queueAbandonedFollowUpAction(
  orderId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const order = await getOrder(workspace.id, orderId);
  if (!order) return { ok: false, error: "Order not found." };

  await prisma.$transaction(async (tx) => {
    const channel = order.customer?.phone ? "WHATSAPP" : "EMAIL";
    const message = `Halo ${order.customer?.name ?? ""}, checkout ${order.orderNumber} masih tertunda. Kami siap bantu kalau ada kendala pembayaran.`;

    await tx.followUpTask.create({
      data: {
        workspaceId: workspace.id,
        orderId: order.id,
        customerId: order.customerId,
        title: `Recover ${order.orderNumber}`,
        note: message,
        channel,
        priority: "HIGH",
        dueAt: new Date(),
      },
    });
    if (channel === "WHATSAPP" && order.customer?.phone) {
      await queueWhatsAppInboxMessage(tx, {
        workspaceId: workspace.id,
        customerId: order.customer.id,
        contactName: order.customer.name,
        contactPhone: order.customer.phone,
        body: message,
        deliver: true,
      });
    }
    await tx.abandonedCheckoutRecovery.upsert({
      where: { orderId },
      update: {
        status: "CONTACTED",
        attempts: { increment: 1 },
        lastContactedAt: new Date(),
        snoozedUntil: null,
      },
      create: {
        workspaceId: workspace.id,
        orderId,
        status: "CONTACTED",
        attempts: 1,
        lastContactedAt: new Date(),
      },
    });
  });

  revalidatePath("/dashboard/abandoned");
  revalidatePath("/dashboard/follow-up");
  revalidatePath("/dashboard/inbox");
  return { ok: true };
}

export async function setAbandonedRecoveryStatusAction(
  orderId: string,
  status: AbandonedRecoveryStatus
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const order = await getOrder(workspace.id, orderId);
  if (!order) return { ok: false, error: "Order not found." };

  await upsertRecovery(workspace.id, orderId, {
    status,
    snoozedUntil: status === "SNOOZED" ? daysFromNow(2) : null,
    recoveredAt: status === "RECOVERED" ? new Date() : null,
    ignoredAt: status === "IGNORED" ? new Date() : null,
  });

  revalidatePath("/dashboard/abandoned");
  return { ok: true };
}

export async function resetAbandonedRecoveryAction(
  orderId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const order = await getOrder(workspace.id, orderId);
  if (!order) return { ok: false, error: "Order not found." };
  await upsertRecovery(workspace.id, orderId, {
    status: "OPEN",
    snoozedUntil: null,
    recoveredAt: null,
    ignoredAt: null,
  });
  revalidatePath("/dashboard/abandoned");
  return { ok: true };
}

function daysFromNow(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value;
}
