import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Runs against a real Postgres: what is under test is the unique index that
// stops a retried webhook from duplicating a message, and the filtering that
// now happens in the database instead of the browser.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { receiveInboxMessage } from "@/lib/actions/inbox";
import {
  inboxCounts,
  listInboxConversations,
  loadInboxConversation,
  MESSAGE_PAGE_SIZE,
  normalizeInboxPhone,
} from "@/lib/inbox";

let workspaceId = "";
let ownerId = "";

beforeAll(async () => {
  const tag = `inbox-queries-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("normalizeInboxPhone", () => {
  it("reduces every spelling of a number to the same digits", () => {
    expect(normalizeInboxPhone("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizeInboxPhone("6281234567890")).toBe("6281234567890");
    expect(normalizeInboxPhone("(0812) 3456 7890")).toBe("081234567890");
  });
});

describe("receiveInboxMessage", () => {
  it("keeps one thread when the same number arrives in two spellings", async () => {
    const phone = "628111000001";
    await receiveInboxMessage({ workspaceId, phone: `+${phone}`, body: "Halo" });
    await receiveInboxMessage({ workspaceId, phone, body: "Masih di sana?" });

    const conversations = await prisma.inboxConversation.findMany({
      where: { workspaceId, contactPhone: { contains: "628111000001" } },
    });
    expect(conversations).toHaveLength(1);
    expect(conversations[0].contactPhone).toBe(phone);
    expect(conversations[0].unreadCount).toBe(2);
  });

  it("ignores a webhook the provider delivered twice", async () => {
    const phone = "628111000002";
    const first = await receiveInboxMessage({
      workspaceId,
      phone,
      body: "Pesanan saya bagaimana?",
      providerMessageId: "wamid.RETRY1",
    });
    const second = await receiveInboxMessage({
      workspaceId,
      phone,
      body: "Pesanan saya bagaimana?",
      providerMessageId: "wamid.RETRY1",
    });

    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");
    expect(second.conversationId).toBe(first.conversationId);

    const conversation = await prisma.inboxConversation.findUniqueOrThrow({
      where: { id: first.conversationId },
      include: { messages: true },
    });
    // The retry must not double the message or the unread badge.
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.unreadCount).toBe(1);
  });

  it("still stores distinct messages that carry no provider id", async () => {
    const phone = "628111000003";
    await receiveInboxMessage({ workspaceId, phone, body: "Satu" });
    await receiveInboxMessage({ workspaceId, phone, body: "Dua" });

    const count = await prisma.inboxMessage.count({
      where: { workspaceId, conversation: { contactPhone: phone } },
    });
    expect(count).toBe(2);
  });
});

describe("listInboxConversations", () => {
  beforeAll(async () => {
    await receiveInboxMessage({
      workspaceId,
      phone: "628222000001",
      name: "Budi Santoso",
      body: "Mau tanya ongkir ke Bandung",
    });
    await receiveInboxMessage({
      workspaceId,
      phone: "628333000002",
      name: "Citra",
      body: "Apakah stok masih ada?",
    });
    // Read, so it drops out of the unread filter.
    await prisma.inboxConversation.updateMany({
      where: { workspaceId, contactPhone: "628333000002" },
      data: { unreadCount: 0, status: "RESOLVED" },
    });
  });

  it("finds a conversation by name", async () => {
    const { conversations } = await listInboxConversations({
      workspaceId,
      q: "budi",
      status: "all",
    });
    expect(conversations.map((c) => c.contactPhone)).toEqual(["628222000001"]);
  });

  it("finds a conversation by a number typed with punctuation", async () => {
    const { conversations } = await listInboxConversations({
      workspaceId,
      q: "+628 333 000 002",
      status: "all",
    });
    expect(conversations.map((c) => c.contactPhone)).toEqual(["628333000002"]);
  });

  it("finds a conversation by what was said in it", async () => {
    const { conversations } = await listInboxConversations({
      workspaceId,
      q: "ongkir",
      status: "all",
    });
    expect(conversations.map((c) => c.contactPhone)).toEqual(["628222000001"]);
  });

  it("filters by unread and by status", async () => {
    const unread = await listInboxConversations({ workspaceId, status: "unread" });
    expect(unread.conversations.every((c) => c.unreadCount > 0)).toBe(true);
    expect(unread.conversations.map((c) => c.contactPhone)).not.toContain(
      "628333000002"
    );

    const resolved = await listInboxConversations({ workspaceId, status: "RESOLVED" });
    expect(resolved.conversations.map((c) => c.contactPhone)).toEqual([
      "628333000002",
    ]);
  });

  it("reports more pages without returning them", async () => {
    const page = await listInboxConversations({ workspaceId, status: "all", take: 1 });
    expect(page.conversations).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });

  it("counts the whole workspace, not the page", async () => {
    const page = await listInboxConversations({ workspaceId, status: "all", take: 1 });
    const counts = await inboxCounts(workspaceId);
    expect(counts.open).toBeGreaterThan(page.conversations.length);
    expect(counts.unread).toBeGreaterThan(0);
  });
});

describe("loadInboxConversation", () => {
  it("returns the tail of a long thread and offers the rest", async () => {
    const phone = "628444000001";
    const { conversationId } = await receiveInboxMessage({
      workspaceId,
      phone,
      body: "pesan 0",
    });

    const total = MESSAGE_PAGE_SIZE + 5;
    for (let i = 1; i < total; i += 1) {
      await prisma.inboxMessage.create({
        data: {
          workspaceId,
          conversationId,
          direction: "INBOUND",
          status: "RECEIVED",
          body: `pesan ${i}`,
          // Distinct timestamps, so "newest" is unambiguous.
          createdAt: new Date(Date.now() + i * 1000),
        },
      });
    }

    const thread = await loadInboxConversation({ workspaceId, conversationId });
    expect(thread).not.toBeNull();
    expect(thread!.messages).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(thread!.hasOlder).toBe(true);
    // Oldest of the page first, newest last — the order a chat is read in.
    expect(thread!.messages.at(-1)!.body).toBe(`pesan ${total - 1}`);
    expect(thread!.messages[0].body).toBe(`pesan ${total - MESSAGE_PAGE_SIZE}`);

    const deeper = await loadInboxConversation({
      workspaceId,
      conversationId,
      take: thread!.nextTake,
    });
    expect(deeper!.messages).toHaveLength(total);
    expect(deeper!.hasOlder).toBe(false);
  });

  it("refuses a conversation from another workspace", async () => {
    const other = await prisma.inboxConversation.findFirstOrThrow({
      where: { workspaceId },
    });
    const thread = await loadInboxConversation({
      workspaceId: "someone-elses-workspace",
      conversationId: other.id,
    });
    expect(thread).toBeNull();
  });
});
