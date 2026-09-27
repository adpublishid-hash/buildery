import type { Metadata } from "next";

import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import {
  CONVERSATION_PAGE_SIZE,
  inboxCounts,
  inboxCustomerContext,
  inboxWorkspaceContext,
  listInboxConversations,
  loadInboxConversation,
  MESSAGE_PAGE_SIZE,
  resolveInboxAssigneeFilter,
  resolveInboxStatusFilter,
  serviceWindow,
} from "@/lib/inbox";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Inbox - My Landing",
};

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  assignee?: string | string[];
  show?: string | string[];
  msgs?: string | string[];
  c?: string | string[];
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(one(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const { workspace, user } = await requireCurrentWorkspace();

  const status = resolveInboxStatusFilter(searchParams?.status);
  const assignee = resolveInboxAssigneeFilter(searchParams?.assignee);
  const q = (one(searchParams?.q) ?? "").slice(0, 120);
  const show = positiveInt(searchParams?.show, CONVERSATION_PAGE_SIZE);
  const msgs = positiveInt(searchParams?.msgs, MESSAGE_PAGE_SIZE);
  const requestedId = one(searchParams?.c) ?? null;

  const [list, counts, integration, context, requestedThread] = await Promise.all([
    listInboxConversations({
      workspaceId: workspace.id,
      q,
      status,
      assignee,
      viewerId: user.id,
      take: show,
    }),
    inboxCounts(workspace.id),
    prisma.integrationSetting.findUnique({
      where: { workspaceId: workspace.id },
      select: {
        whatsappProvider: true,
        whatsappIsActive: true,
        whatsappSenderNumber: true,
      },
    }),
    inboxWorkspaceContext(workspace.id),
    requestedId
      ? loadInboxConversation({
          workspaceId: workspace.id,
          conversationId: requestedId,
          take: msgs,
        })
      : Promise.resolve(null),
  ]);

  // No conversation asked for (or one that no longer exists): open the first
  // of the current list, so the panel is never empty while messages exist.
  const thread =
    requestedThread ??
    (list.conversations[0]
      ? await loadInboxConversation({
          workspaceId: workspace.id,
          conversationId: list.conversations[0].id,
        })
      : null);

  const customer = thread
    ? await inboxCustomerContext({
        workspaceId: workspace.id,
        customerId: thread.conversation.customerId,
      })
    : null;

  return (
    <InboxWorkspace
      conversations={list.conversations}
      hasMore={list.hasMore}
      nextTake={list.nextTake}
      counts={counts}
      thread={thread}
      customer={customer}
      context={context}
      integration={integration}
      window={
        thread
          ? serviceWindow({
              provider: integration?.whatsappProvider ?? null,
              lastInboundAt: thread.conversation.lastInboundAt,
            })
          : null
      }
      filters={{ q, status, assignee }}
    />
  );
}
