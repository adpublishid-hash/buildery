import "server-only";

import type {
  InboxConversationStatus,
  OrderStatus,
  Prisma,
  WhatsAppProvider,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Reading side of the inbox.
 *
 * The page used to load every conversation with its complete message history —
 * one chatty customer with thousands of messages was shipped to the browser
 * even when their thread was never opened. Conversations and messages are
 * fetched separately now, both paginated, and the list is filtered in Postgres
 * rather than in the client.
 */

/** Conversations per page in the sidebar list. */
export const CONVERSATION_PAGE_SIZE = 30;
/** Messages loaded for the open conversation, newest first. */
export const MESSAGE_PAGE_SIZE = 50;

export const INBOX_STATUS_FILTERS = [
  "all",
  "unread",
  "OPEN",
  "PENDING",
  "RESOLVED",
  "SPAM",
] as const;

export type InboxStatusFilter = (typeof INBOX_STATUS_FILTERS)[number];

export const INBOX_ASSIGNEE_FILTERS = ["all", "mine", "unassigned"] as const;
export type InboxAssigneeFilter = (typeof INBOX_ASSIGNEE_FILTERS)[number];

export function resolveInboxAssigneeFilter(
  value: string | string[] | undefined
): InboxAssigneeFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return INBOX_ASSIGNEE_FILTERS.includes(raw as InboxAssigneeFilter)
    ? (raw as InboxAssigneeFilter)
    : "all";
}

/**
 * WhatsApp only allows a free-form reply within 24 hours of the customer's last
 * message; after that the Cloud API rejects anything but an approved template.
 * Operators used to find out by watching a reply turn FAILED.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ServiceWindow = {
  /** Only the official Cloud API enforces this; gateways are not checked. */
  enforced: boolean;
  open: boolean;
  expiresAt: Date | null;
};

export function serviceWindow(input: {
  provider: WhatsAppProvider | null | undefined;
  lastInboundAt: Date | null;
  now?: Date;
}): ServiceWindow {
  const enforced = input.provider === "WABA";
  if (!input.lastInboundAt) {
    return { enforced, open: !enforced, expiresAt: null };
  }
  const expiresAt = new Date(input.lastInboundAt.getTime() + SERVICE_WINDOW_MS);
  const now = input.now ?? new Date();
  return { enforced, open: expiresAt.getTime() > now.getTime(), expiresAt };
}

export function resolveInboxStatusFilter(
  value: string | string[] | undefined
): InboxStatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return INBOX_STATUS_FILTERS.includes(raw as InboxStatusFilter)
    ? (raw as InboxStatusFilter)
    : "all";
}

/**
 * One shape for every phone number we store.
 *
 * A number typed as "+62 812…" in the dashboard and the same number arriving
 * as "62812…" from the WhatsApp webhook used to open two separate threads,
 * because the conversation's unique key is the string itself.
 */
export function normalizeInboxPhone(input: string) {
  return input.replace(/\D/g, "");
}

export type InboxConversationListItem = {
  id: string;
  contactName: string | null;
  contactPhone: string;
  status: InboxConversationStatus;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  labels: { id: string; name: string; color: string }[];
};

function conversationFilter(
  workspaceId: string,
  options: {
    q?: string;
    status: InboxStatusFilter;
    assignee?: InboxAssigneeFilter;
    viewerId?: string;
  }
): Prisma.InboxConversationWhereInput {
  const where: Prisma.InboxConversationWhereInput = { workspaceId };

  if (options.status === "unread") where.unreadCount = { gt: 0 };
  else if (options.status !== "all") where.status = options.status;

  if (options.assignee === "unassigned") where.assignedToId = null;
  else if (options.assignee === "mine") where.assignedToId = options.viewerId ?? "";

  const q = options.q?.trim();
  if (q) {
    // Digits are matched against the number, anything else against the name
    // and the preview, so "0812" and "budi" both find the same thread.
    const digits = normalizeInboxPhone(q);
    where.OR = [
      { contactName: { contains: q, mode: "insensitive" } },
      { lastMessagePreview: { contains: q, mode: "insensitive" } },
      ...(digits ? [{ contactPhone: { contains: digits } }] : []),
    ];
  }

  return where;
}

export async function listInboxConversations(input: {
  workspaceId: string;
  q?: string;
  status: InboxStatusFilter;
  assignee?: InboxAssigneeFilter;
  viewerId?: string;
  take?: number;
}) {
  const take = Math.min(Math.max(input.take ?? CONVERSATION_PAGE_SIZE, 1), 300);
  const where = conversationFilter(input.workspaceId, {
    q: input.q,
    status: input.status,
    assignee: input.assignee,
    viewerId: input.viewerId,
  });

  // One extra row answers "is there more" without a second count query.
  const rows = await prisma.inboxConversation.findMany({
    where,
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      status: true,
      unreadCount: true,
      lastMessagePreview: true,
      lastMessageAt: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      labels: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: take + 1,
  });

  return {
    conversations: rows.slice(0, take) as InboxConversationListItem[],
    hasMore: rows.length > take,
    nextTake: take + CONVERSATION_PAGE_SIZE,
  };
}

/**
 * The open conversation, with only its most recent messages.
 *
 * `take` grows when the operator asks for older messages, so the thread keeps
 * reading top-to-bottom instead of jumping to a separate page of history.
 */
export async function loadInboxConversation(input: {
  workspaceId: string;
  conversationId: string;
  take?: number;
}) {
  const take = Math.min(Math.max(input.take ?? MESSAGE_PAGE_SIZE, 1), 500);

  const conversation = await prisma.inboxConversation.findFirst({
    where: { id: input.conversationId, workspaceId: input.workspaceId },
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      status: true,
      unreadCount: true,
      lastInboundAt: true,
      customerId: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      labels: { select: { id: true, name: true, color: true } },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!conversation) return null;

  // Newest first with one extra row, then reversed: the tail of a long thread
  // is what an operator needs, and the extra row says whether more exists.
  const rows = await prisma.inboxMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: take + 1,
  });

  const page = rows.slice(0, take);
  return {
    conversation,
    messages: page.reverse(),
    hasOlder: rows.length > take,
    nextTake: take + MESSAGE_PAGE_SIZE,
  };
}

/**
 * Who the customer is, for the panel beside the thread.
 *
 * The conversation already knows its Customer; showing nothing of their order
 * history meant an operator answering "where is my parcel?" had to go hunting
 * in another tab.
 */
export async function inboxCustomerContext(input: {
  workspaceId: string;
  customerId: string | null;
}) {
  if (!input.customerId) return null;

  const [customer, totals, recentOrders] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: input.customerId, workspaceId: input.workspaceId },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    }),
    prisma.order.aggregate({
      where: {
        workspaceId: input.workspaceId,
        customerId: input.customerId,
        status: { in: PAID_ORDER_STATUSES },
      },
      _count: true,
      _sum: { total: true },
    }),
    prisma.order.findMany({
      where: { workspaceId: input.workspaceId, customerId: input.customerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
      },
    }),
  ]);
  if (!customer) return null;

  return {
    customer,
    paidOrders: totals._count,
    lifetimeValue: totals._sum?.total ?? 0,
    recentOrders,
  };
}

/** Orders that represent money actually taken, as elsewhere in the dashboard. */
const PAID_ORDER_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "COMPLETED"];

/**
 * Everything the inbox needs once per page: who can be assigned work, which
 * labels exist, and the canned replies to offer in the composer.
 */
export async function inboxWorkspaceContext(workspaceId: string) {
  const [members, labels, quickReplies] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.inboxLabel.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.inboxQuickReply.findMany({
      where: { workspaceId },
      orderBy: { shortcut: "asc" },
      select: { id: true, shortcut: true, body: true },
    }),
  ]);

  return {
    members: members.map((row) => row.user),
    labels,
    quickReplies,
  };
}

/** Totals for the header, which the filtered page of conversations cannot give. */
export async function inboxCounts(workspaceId: string) {
  const [open, unread] = await Promise.all([
    prisma.inboxConversation.count({ where: { workspaceId, status: "OPEN" } }),
    countUnreadConversations(workspaceId),
  ]);
  return { open, unread };
}

/** Conversations still holding unread messages, for the sidebar badge. */
export async function countUnreadConversations(workspaceId: string) {
  return prisma.inboxConversation.count({
    where: { workspaceId, unreadCount: { gt: 0 } },
  });
}

/**
 * A cheap fingerprint of the inbox, polled by the open page: it refreshes only
 * when this changes, instead of re-rendering the whole route every few seconds.
 */
export async function inboxPulse(workspaceId: string) {
  const [latest, unread] = await Promise.all([
    prisma.inboxMessage.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    }),
    countUnreadConversations(workspaceId),
  ]);
  return {
    latestMessageId: latest?.id ?? null,
    latestAt: latest?.createdAt?.toISOString() ?? null,
    unread,
  };
}

/**
 * Shapes the inbox UI renders. Declared here so the client components describe
 * exactly what the loaders return, instead of a hand-copied approximation that
 * drifts the next time a field is added.
 */
export type InboxThread = NonNullable<
  Awaited<ReturnType<typeof loadInboxConversation>>
>;
export type InboxCustomerContext = NonNullable<
  Awaited<ReturnType<typeof inboxCustomerContext>>
>;
export type InboxWorkspaceContext = Awaited<
  ReturnType<typeof inboxWorkspaceContext>
>;
