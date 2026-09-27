"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import type {
  InboxConversationStatus,
  InboxMessageKind,
  WhatsAppProvider,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { normalizeInboxPhone, serviceWindow } from "@/lib/inbox";
import { attachmentLabel } from "@/lib/whatsapp/inbox-parse";
import { enqueueJob } from "@/lib/jobs/queue";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  // The acting user is recorded on replies and notes: a shared inbox needs to
  // show who said what.
  return { ...current.workspace, viewerId: session.user.id };
}

/**
 * Refreshes the inbox and the shell around it.
 *
 * The unread badge is counted in the dashboard layout, and the default
 * `revalidatePath(path)` only reaches the page — so the badge kept showing a
 * conversation that had already been read.
 */
function revalidateInbox() {
  revalidatePath("/dashboard", "layout");
}

function preview(body: string) {
  return body.trim().slice(0, 140);
}

export type ReceiveInboxResult =
  | { status: "created"; conversationId: string }
  | { status: "duplicate"; conversationId: string };

/**
 * Records one inbound WhatsApp message.
 *
 * Providers retry a webhook they did not see a 2xx for, so the same message can
 * arrive several times. `providerMessageId` makes that harmless: a repeat is
 * recognised and dropped instead of appearing twice and bumping the unread
 * badge again.
 */
export async function receiveInboxMessage({
  workspaceId,
  phone,
  name,
  body,
  provider,
  providerMessageId,
  kind = "TEXT",
  mediaUrl = null,
  mediaMimeType = null,
  mediaFilename = null,
}: {
  workspaceId: string;
  phone: string;
  name?: string | null;
  body: string;
  provider?: WhatsAppProvider | null;
  providerMessageId?: string | null;
  kind?: InboxMessageKind;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
}): Promise<ReceiveInboxResult> {
  const contactPhone = normalizeInboxPhone(phone);
  const messageBody = body.trim();
  // A photo sent without a caption is still a message; only a payload with
  // neither text nor an attachment is meaningless.
  if (!workspaceId || !contactPhone || (!messageBody && kind === "TEXT")) {
    throw new Error("Invalid inbox payload.");
  }
  const previewText = messageBody || attachmentLabel(kind);
  const externalId = providerMessageId?.trim() || null;
  const now = new Date();

  if (externalId) {
    const seen = await prisma.inboxMessage.findFirst({
      where: { workspaceId, providerMessageId: externalId },
      select: { conversationId: true },
    });
    if (seen) {
      return { status: "duplicate", conversationId: seen.conversationId };
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: {
          workspaceId,
          OR: [{ phone: contactPhone }, { phone: `+${contactPhone}` }],
        },
        select: { id: true, name: true },
      });

      const conversation = await tx.inboxConversation.upsert({
        where: {
          workspaceId_channel_contactPhone: {
            workspaceId,
            channel: "WHATSAPP",
            contactPhone,
          },
        },
        update: {
          customerId: customer?.id ?? undefined,
          contactName: name?.trim() || customer?.name || undefined,
          status: "OPEN",
          lastMessagePreview: preview(previewText),
          lastMessageAt: now,
          // Starts WhatsApp's 24-hour service window over again.
          lastInboundAt: now,
          unreadCount: { increment: 1 },
        },
        create: {
          workspaceId,
          customerId: customer?.id,
          channel: "WHATSAPP",
          contactPhone,
          contactName: name?.trim() || customer?.name || null,
          status: "OPEN",
          lastMessagePreview: preview(previewText),
          lastMessageAt: now,
          lastInboundAt: now,
          unreadCount: 1,
        },
      });

      await tx.inboxMessage.create({
        data: {
          workspaceId,
          conversationId: conversation.id,
          direction: "INBOUND",
          status: "RECEIVED",
          kind,
          body: messageBody,
          mediaUrl,
          mediaMimeType,
          mediaFilename,
          provider,
          providerMessageId: externalId,
          receivedAt: now,
        },
      });

      // Nobody is watching a webhook; tell the team there is something to read.
      await enqueueJob(
        {
          kind: "INBOX_NOTIFY",
          workspaceId,
          payload: { conversationId: conversation.id },
          dedupeKey: `inbox-notify:${conversation.id}`,
        },
        tx
      );

      return { status: "created" as const, conversationId: conversation.id };
    });
    return result;
  } catch (error) {
    // Two copies of the same webhook can race past the check above; the unique
    // index settles it and the loser is still a duplicate, not a failure.
    if (
      externalId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const seen = await prisma.inboxMessage.findFirst({
        where: { workspaceId, providerMessageId: externalId },
        select: { conversationId: true },
      });
      if (seen) return { status: "duplicate", conversationId: seen.conversationId };
    }
    throw error;
  }
}

export async function createInboxConversationAction(
  formData: FormData
): Promise<ActionResult<{ conversationId: string }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const phone = normalizeInboxPhone(String(formData.get("phone") || ""));
  const name = String(formData.get("name") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!phone || !body) {
    return { ok: false, error: "Nomor WhatsApp dan pesan wajib diisi." };
  }

  const result = await receiveInboxMessage({
    workspaceId: workspace.id,
    phone,
    name,
    body,
    provider: null,
  });

  revalidateInbox();
  return { ok: true, data: { conversationId: result.conversationId } };
}

export async function sendInboxReplyAction(
  conversationId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const userId = workspace.viewerId;
  const body = String(formData.get("body") || "").trim();
  if (!body) return { ok: false, error: "Balasan tidak boleh kosong." };

  const conversation = await prisma.inboxConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, workspaceId: true, lastInboundAt: true },
  });
  if (!conversation || conversation.workspaceId !== workspace.id) {
    return { ok: false, error: "Conversation not found." };
  }

  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId: workspace.id },
    select: { whatsappProvider: true, whatsappIsActive: true },
  });

  const active = Boolean(integration?.whatsappIsActive);

  // Outside the 24-hour window the Cloud API rejects free-form text, so queue
  // nothing rather than let it fail at the provider.
  const window = serviceWindow({
    provider: integration?.whatsappProvider ?? null,
    lastInboundAt: conversation.lastInboundAt,
  });
  if (window.enforced && !window.open) {
    return {
      ok: false,
      error:
        "Jendela 24 jam WhatsApp sudah lewat. Balasan bebas ditolak WhatsApp; kirim template yang sudah disetujui.",
    };
  }

  await prisma.$transaction(async (tx) => {
    const message = await tx.inboxMessage.create({
      data: {
        workspaceId: workspace.id,
        conversationId,
        direction: "OUTBOUND",
        status: active ? "QUEUED" : "FAILED",
        body,
        authorId: userId,
        provider: integration?.whatsappProvider ?? null,
        // Only the send job may stamp this; writing it here reported a
        // delivery that never happened.
        sentAt: null,
        errorMessage: active
          ? null
          : "Aktifkan provider WhatsApp di Settings > Integrasi sebelum mengirim.",
      },
    });

    await tx.inboxConversation.update({
      where: { id: conversationId },
      data: {
        status: "PENDING",
        lastMessagePreview: preview(body),
        lastMessageAt: new Date(),
        unreadCount: 0,
      },
    });

    if (active) {
      await enqueueJob(
        {
          kind: "WHATSAPP_SEND",
          workspaceId: workspace.id,
          payload: { messageId: message.id },
          dedupeKey: `whatsapp-send:${message.id}`,
        },
        tx
      );
    }
  });

  revalidateInbox();
  return { ok: true };
}

export async function updateInboxConversationStatusAction(
  conversationId: string,
  status: InboxConversationStatus
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  await prisma.inboxConversation.updateMany({
    where: { id: conversationId, workspaceId: workspace.id },
    data: { status, unreadCount: 0 },
  });

  revalidateInbox();
  return { ok: true };
}

/**
 * Clears the unread badge once an operator actually opens the thread.
 *
 * Before this, unread only reset on a reply or a status change, so a glanced-at
 * conversation kept claiming it had unread messages.
 */
export async function markInboxConversationReadAction(
  conversationId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const updated = await prisma.inboxConversation.updateMany({
    where: { id: conversationId, workspaceId: workspace.id, unreadCount: { gt: 0 } },
    data: { unreadCount: 0 },
  });

  // Nothing changed means it was already read — no need to re-render the route.
  if (updated.count > 0) revalidateInbox();
  return { ok: true };
}

/**
 * Hands a conversation to one teammate, or back to nobody.
 *
 * A shared inbox without this has two people typing the same answer.
 */
export async function assignInboxConversationAction(
  conversationId: string,
  assignedToId: string | null
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  if (assignedToId) {
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, userId: assignedToId },
      select: { id: true },
    });
    if (!member) return { ok: false, error: "Orang itu bukan anggota workspace ini." };
  }

  await prisma.inboxConversation.updateMany({
    where: { id: conversationId, workspaceId: workspace.id },
    data: { assignedToId },
  });

  revalidateInbox();
  return { ok: true };
}

export async function createInboxLabelAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const name = String(formData.get("name") || "").trim().slice(0, 40);
  const color = String(formData.get("color") || "").trim();
  if (!name) return { ok: false, error: "Nama label wajib diisi." };

  const existing = await prisma.inboxLabel.findFirst({
    where: { workspaceId: workspace.id, name },
    select: { id: true },
  });
  if (existing) return { ok: true, data: { id: existing.id } };

  const label = await prisma.inboxLabel.create({
    data: {
      workspaceId: workspace.id,
      name,
      // Anything that is not a hex colour would break the swatch.
      ...(/^#[0-9a-f]{6}$/i.test(color) ? { color } : {}),
    },
    select: { id: true },
  });

  revalidateInbox();
  return { ok: true, data: { id: label.id } };
}

export async function toggleInboxLabelAction(
  conversationId: string,
  labelId: string,
  attach: boolean
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const [conversation, label] = await Promise.all([
    prisma.inboxConversation.findFirst({
      where: { id: conversationId, workspaceId: workspace.id },
      select: { id: true },
    }),
    prisma.inboxLabel.findFirst({
      where: { id: labelId, workspaceId: workspace.id },
      select: { id: true },
    }),
  ]);
  if (!conversation || !label) return { ok: false, error: "Label tidak ditemukan." };

  await prisma.inboxConversation.update({
    where: { id: conversation.id },
    data: {
      labels: attach ? { connect: { id: label.id } } : { disconnect: { id: label.id } },
    },
  });

  revalidateInbox();
  return { ok: true };
}

/** An internal note: the team sees it, the customer never does. */
export async function addInboxNoteAction(
  conversationId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const body = String(formData.get("body") || "").trim().slice(0, 2000);
  if (!body) return { ok: false, error: "Catatan tidak boleh kosong." };

  const conversation = await prisma.inboxConversation.findFirst({
    where: { id: conversationId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!conversation) return { ok: false, error: "Conversation not found." };

  await prisma.inboxNote.create({
    data: {
      workspaceId: workspace.id,
      conversationId: conversation.id,
      authorId: workspace.viewerId,
      body,
    },
  });

  revalidateInbox();
  return { ok: true };
}

export async function deleteInboxNoteAction(noteId: string): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  await prisma.inboxNote.deleteMany({
    where: { id: noteId, workspaceId: workspace.id },
  });

  revalidateInbox();
  return { ok: true };
}

/** Canned replies, addressed by a "/shortcut" in the composer. */
export async function saveInboxQuickReplyAction(
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const shortcut = String(formData.get("shortcut") || "")
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .slice(0, 32);
  const body = String(formData.get("body") || "").trim().slice(0, 2000);

  if (!/^[a-z0-9][a-z0-9-_]*$/.test(shortcut)) {
    return {
      ok: false,
      error: "Shortcut hanya boleh huruf kecil, angka, strip, dan garis bawah.",
    };
  }
  if (!body) return { ok: false, error: "Isi balasan cepat wajib diisi." };

  await prisma.inboxQuickReply.upsert({
    where: { workspaceId_shortcut: { workspaceId: workspace.id, shortcut } },
    update: { body },
    create: { workspaceId: workspace.id, shortcut, body },
  });

  revalidateInbox();
  return { ok: true };
}

export async function deleteInboxQuickReplyAction(
  id: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  await prisma.inboxQuickReply.deleteMany({
    where: { id, workspaceId: workspace.id },
  });

  revalidateInbox();
  return { ok: true };
}
