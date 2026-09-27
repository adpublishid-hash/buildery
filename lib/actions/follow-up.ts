"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FollowUpStatus } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { queueWhatsAppInboxMessage } from "@/lib/ecommerce-integration";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const followUpSchema = z.object({
  title: z.string().min(2, "Title is required").max(140),
  note: z.string().max(1000).optional().or(z.literal("")),
  customerId: z.string().optional().or(z.literal("")),
  orderId: z.string().optional().or(z.literal("")),
  channel: z.enum(["EMAIL", "WHATSAPP", "PHONE", "MANUAL"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  dueAt: z.string().optional().or(z.literal("")),
});

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace;
}

function parseDueAt(raw?: string) {
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function createFollowUpAction(
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const parsed = followUpSchema.safeParse({
    title: formData.get("title"),
    note: formData.get("note") || "",
    customerId: formData.get("customerId") || "",
    orderId: formData.get("orderId") || "",
    channel: formData.get("channel") || "EMAIL",
    priority: formData.get("priority") || "MEDIUM",
    dueAt: formData.get("dueAt") || "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const [customer, order] = await Promise.all([
    parsed.data.customerId
      ? prisma.customer.findFirst({
          where: { id: parsed.data.customerId, workspaceId: workspace.id },
          select: { id: true, name: true, phone: true },
        })
      : Promise.resolve(null),
    parsed.data.orderId
      ? prisma.order.findFirst({
          where: { id: parsed.data.orderId, workspaceId: workspace.id },
          include: { customer: { select: { id: true, name: true, phone: true } } },
        })
      : Promise.resolve(null),
  ]);
  if (parsed.data.customerId && !customer) {
    return { ok: false, error: "Customer not found." };
  }
  if (parsed.data.orderId && !order) {
    return { ok: false, error: "Order not found." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.followUpTask.create({
      data: {
        workspaceId: workspace.id,
        customerId: parsed.data.customerId || order?.customerId || null,
        orderId: parsed.data.orderId || null,
        title: parsed.data.title.trim(),
        note: parsed.data.note?.trim() || null,
        channel: parsed.data.channel,
        priority: parsed.data.priority,
        dueAt: parseDueAt(parsed.data.dueAt),
      },
    });

    const target = customer ?? order?.customer ?? null;
    if (parsed.data.channel === "WHATSAPP" && target?.phone) {
      await queueWhatsAppInboxMessage(tx, {
        workspaceId: workspace.id,
        customerId: target.id,
        contactName: target.name,
        contactPhone: target.phone,
        body:
          parsed.data.note?.trim() ||
          `${parsed.data.title.trim()}${order ? ` untuk order ${order.orderNumber}` : ""}`,
        deliver: true,
      });
    }
  });

  revalidatePath("/dashboard/follow-up");
  revalidatePath("/dashboard/inbox");
  return { ok: true };
}

export async function updateFollowUpStatusAction(
  taskId: string,
  status: FollowUpStatus
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const task = await prisma.followUpTask.findFirst({
    where: { id: taskId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!task) return { ok: false, error: "Follow-up not found." };

  await prisma.followUpTask.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
      dueAt: status === "SNOOZED" ? tomorrow() : undefined,
    },
  });
  revalidatePath("/dashboard/follow-up");
  return { ok: true };
}

export async function deleteFollowUpAction(taskId: string): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const task = await prisma.followUpTask.findFirst({
    where: { id: taskId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!task) return { ok: false, error: "Follow-up not found." };
  await prisma.followUpTask.delete({ where: { id: taskId } });
  revalidatePath("/dashboard/follow-up");
  return { ok: true };
}

export async function createOrderFollowUpAction(
  orderId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const order = await prisma.order.findFirst({
    where: { id: orderId, workspaceId: workspace.id },
    include: { customer: true },
  });
  if (!order) return { ok: false, error: "Order not found." };

  await prisma.$transaction(async (tx) => {
    const channel = order.customer?.phone ? "WHATSAPP" : "EMAIL";
    const note =
      order.status === "PENDING"
        ? `Reminder pembayaran untuk ${order.orderNumber}. Total tagihan masih menunggu.`
        : `Update pesanan ${order.orderNumber}. Tim sedang menindaklanjuti order ini.`;

    await tx.followUpTask.create({
      data: {
        workspaceId: workspace.id,
        orderId: order.id,
        customerId: order.customerId,
        title: `Follow up ${order.orderNumber}`,
        note,
        channel,
        priority: order.status === "PENDING" ? "HIGH" : "MEDIUM",
        dueAt: new Date(),
      },
    });

    if (channel === "WHATSAPP" && order.customer?.phone) {
      await queueWhatsAppInboxMessage(tx, {
        workspaceId: workspace.id,
        customerId: order.customer.id,
        contactName: order.customer.name,
        contactPhone: order.customer.phone,
        body: note,
        deliver: true,
      });
    }
  });
  revalidatePath("/dashboard/follow-up");
  revalidatePath("/dashboard/inbox");
  return { ok: true };
}

function tomorrow() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return value;
}
