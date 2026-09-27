import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Against a real Postgres: retention, the assignee filter and the customer
// context are all database behaviour, and the join table behind labels only
// exists there.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { receiveInboxMessage } from "@/lib/actions/inbox";
import {
  inboxCustomerContext,
  inboxWorkspaceContext,
  listInboxConversations,
  loadInboxConversation,
  serviceWindow,
  SERVICE_WINDOW_MS,
} from "@/lib/inbox";
import { pruneInboxMessages } from "@/lib/inbox-retention";

const DAY_MS = 24 * 60 * 60 * 1000;

let workspaceId = "";
let ownerId = "";
let mateId = "";

beforeAll(async () => {
  const tag = `inbox-collab-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const mate = await prisma.user.create({
    data: { name: `${tag}-mate`, email: `${tag}-mate@buildery.test`, role: "CUSTOMER" },
  });
  mateId = mate.id;

  const workspace = await prisma.workspace.create({
    data: {
      name: tag,
      slug: tag,
      createdById: owner.id,
      members: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: mate.id, role: "EDITOR" },
        ],
      },
    },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, mateId] } } });
});

describe("serviceWindow", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("is only enforced for the official Cloud API", () => {
    const stale = new Date(now.getTime() - 2 * DAY_MS);
    expect(
      serviceWindow({ provider: "ONESENDER", lastInboundAt: stale, now })
    ).toMatchObject({ enforced: false, open: false });
    expect(
      serviceWindow({ provider: "WABA", lastInboundAt: stale, now })
    ).toMatchObject({ enforced: true, open: false });
  });

  it("stays open for 24 hours after the customer wrote", () => {
    const justInside = new Date(now.getTime() - SERVICE_WINDOW_MS + 60_000);
    const justOutside = new Date(now.getTime() - SERVICE_WINDOW_MS - 60_000);
    expect(
      serviceWindow({ provider: "WABA", lastInboundAt: justInside, now }).open
    ).toBe(true);
    expect(
      serviceWindow({ provider: "WABA", lastInboundAt: justOutside, now }).open
    ).toBe(false);
  });

  it("treats a thread the customer never wrote in as closed on WABA", () => {
    // Nothing to measure 24 hours from; a template is the only way in.
    expect(
      serviceWindow({ provider: "WABA", lastInboundAt: null, now })
    ).toMatchObject({ open: false, expiresAt: null });
    expect(
      serviceWindow({ provider: "ONESENDER", lastInboundAt: null, now }).open
    ).toBe(true);
  });
});

describe("receiveInboxMessage", () => {
  it("records attachments and restarts the service window", async () => {
    const before = new Date();
    const { conversationId } = await receiveInboxMessage({
      workspaceId,
      phone: "628555000001",
      body: "Paketnya penyok",
      kind: "IMAGE",
      mediaUrl: "https://cdn.example.com/foto.jpg",
      mediaMimeType: "image/jpeg",
    });

    const conversation = await prisma.inboxConversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { messages: true },
    });
    expect(conversation.messages[0]).toMatchObject({
      kind: "IMAGE",
      mediaUrl: "https://cdn.example.com/foto.jpg",
      mediaMimeType: "image/jpeg",
    });
    expect(conversation.lastInboundAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
  });

  it("accepts an attachment that came with no caption at all", async () => {
    const { conversationId } = await receiveInboxMessage({
      workspaceId,
      phone: "628555000002",
      body: "",
      kind: "DOCUMENT",
      mediaFilename: "invoice.pdf",
    });

    const conversation = await prisma.inboxConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    // The list needs something to show even when the customer typed nothing.
    expect(conversation.lastMessagePreview).toBe("[Dokumen]");
  });

  it("still refuses a payload with neither text nor an attachment", async () => {
    await expect(
      receiveInboxMessage({ workspaceId, phone: "628555000003", body: "  " })
    ).rejects.toThrow();
  });

  it("queues one operator alert per burst, not one per message", async () => {
    const phone = "628555000004";
    await receiveInboxMessage({ workspaceId, phone, body: "Halo" });
    await receiveInboxMessage({ workspaceId, phone, body: "Kak?" });
    await receiveInboxMessage({ workspaceId, phone, body: "Halo kak" });

    const conversation = await prisma.inboxConversation.findFirstOrThrow({
      where: { workspaceId, contactPhone: phone },
    });
    const jobs = await prisma.scheduledJob.findMany({
      where: {
        kind: "INBOX_NOTIFY",
        dedupeKey: `inbox-notify:${conversation.id}`,
        status: { in: ["PENDING", "RUNNING"] },
      },
    });
    expect(jobs).toHaveLength(1);
  });
});

describe("assignment and labels", () => {
  it("filters conversations by who owns them", async () => {
    const mine = await prisma.inboxConversation.findFirstOrThrow({
      where: { workspaceId, contactPhone: "628555000001" },
    });
    await prisma.inboxConversation.update({
      where: { id: mine.id },
      data: { assignedToId: mateId },
    });

    const assigned = await listInboxConversations({
      workspaceId,
      status: "all",
      assignee: "mine",
      viewerId: mateId,
    });
    expect(assigned.conversations.map((c) => c.id)).toEqual([mine.id]);

    const unassigned = await listInboxConversations({
      workspaceId,
      status: "all",
      assignee: "unassigned",
      viewerId: mateId,
    });
    expect(unassigned.conversations.map((c) => c.id)).not.toContain(mine.id);
    expect(unassigned.conversations.length).toBeGreaterThan(0);

    // And the list carries who it belongs to, for the badge in the sidebar.
    expect(assigned.conversations[0].assignedTo?.id).toBe(mateId);
  });

  it("carries labels through the list and the thread", async () => {
    const conversation = await prisma.inboxConversation.findFirstOrThrow({
      where: { workspaceId, contactPhone: "628555000002" },
    });
    const label = await prisma.inboxLabel.create({
      data: { workspaceId, name: "Komplain", color: "#dc2626" },
    });
    await prisma.inboxConversation.update({
      where: { id: conversation.id },
      data: { labels: { connect: { id: label.id } } },
    });

    const thread = await loadInboxConversation({
      workspaceId,
      conversationId: conversation.id,
    });
    expect(thread!.conversation.labels).toEqual([
      { id: label.id, name: "Komplain", color: "#dc2626" },
    ]);

    const context = await inboxWorkspaceContext(workspaceId);
    expect(context.labels.map((l) => l.name)).toContain("Komplain");
    expect(context.members.map((m) => m.id)).toEqual(
      expect.arrayContaining([ownerId, mateId])
    );
  });

  it("keeps notes newest first, with their author", async () => {
    const conversation = await prisma.inboxConversation.findFirstOrThrow({
      where: { workspaceId, contactPhone: "628555000002" },
    });
    await prisma.inboxNote.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        authorId: ownerId,
        body: "Sudah dicek, barang dikirim ulang.",
      },
    });

    const thread = await loadInboxConversation({
      workspaceId,
      conversationId: conversation.id,
    });
    expect(thread!.conversation.notes[0]).toMatchObject({
      body: "Sudah dicek, barang dikirim ulang.",
    });
    expect(thread!.conversation.notes[0].author?.name).toContain("inbox-collab");
  });
});

describe("inboxCustomerContext", () => {
  it("summarises what the customer has bought", async () => {
    const customer = await prisma.customer.create({
      data: { workspaceId, name: "Eka", email: "eka@buildery.test" },
    });
    await prisma.order.createMany({
      data: [
        {
          workspaceId,
          customerId: customer.id,
          orderNumber: "INV-1",
          status: "PAID",
          subtotal: 100_000,
          total: 100_000,
        },
        {
          workspaceId,
          customerId: customer.id,
          orderNumber: "INV-2",
          status: "COMPLETED",
          subtotal: 250_000,
          total: 250_000,
        },
        {
          // Unpaid: counted nowhere, but still shown in the recent list.
          workspaceId,
          customerId: customer.id,
          orderNumber: "INV-3",
          status: "PENDING",
          subtotal: 999_000,
          total: 999_000,
        },
      ],
    });

    const context = await inboxCustomerContext({ workspaceId, customerId: customer.id });
    expect(context).toMatchObject({ paidOrders: 2, lifetimeValue: 350_000 });
    expect(context!.recentOrders).toHaveLength(3);
  });

  it("returns nothing for a conversation with no matching customer", async () => {
    expect(await inboxCustomerContext({ workspaceId, customerId: null })).toBeNull();
  });

  it("refuses a customer from another workspace", async () => {
    const customer = await prisma.customer.findFirstOrThrow({ where: { workspaceId } });
    expect(
      await inboxCustomerContext({ workspaceId: "someone-else", customerId: customer.id })
    ).toBeNull();
  });
});

describe("pruneInboxMessages", () => {
  it("trims dormant threads and leaves active ones whole", async () => {
    const old = new Date(Date.now() - 400 * DAY_MS);

    const dormant = await prisma.inboxConversation.create({
      data: {
        workspaceId,
        channel: "WHATSAPP",
        contactPhone: "628777000001",
        lastMessageAt: old,
        lastMessagePreview: "Terima kasih",
      },
    });
    const active = await prisma.inboxConversation.create({
      data: {
        workspaceId,
        channel: "WHATSAPP",
        contactPhone: "628777000002",
        lastMessageAt: new Date(),
        lastMessagePreview: "Halo lagi",
      },
    });
    for (const conversationId of [dormant.id, active.id]) {
      await prisma.inboxMessage.create({
        data: {
          workspaceId,
          conversationId,
          direction: "INBOUND",
          status: "RECEIVED",
          body: "pesan lama",
          createdAt: old,
        },
      });
    }

    const summary = await pruneInboxMessages({ retentionDays: 365 });
    expect(summary.messages).toBeGreaterThanOrEqual(1);

    expect(
      await prisma.inboxMessage.count({ where: { conversationId: dormant.id } })
    ).toBe(0);
    // The thread itself survives, so the contact and its history line remain.
    expect(
      await prisma.inboxConversation.findUnique({ where: { id: dormant.id } })
    ).not.toBeNull();
    // An old message in a thread that is still being used is not touched.
    expect(
      await prisma.inboxMessage.count({ where: { conversationId: active.id } })
    ).toBe(1);
  });

  it("does nothing when retention is switched off", async () => {
    expect(await pruneInboxMessages({ retentionDays: 0 })).toEqual({
      messages: 0,
      conversations: 0,
    });
  });
});
