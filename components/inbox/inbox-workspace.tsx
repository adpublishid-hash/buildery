"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FlaskConical,
  Loader2,
  MessageCircle,
  PanelRight,
  RotateCcw,
  Search,
  Smartphone,
  Trash2,
  Zap,
} from "lucide-react";
import type { InboxConversationStatus, IntegrationSetting } from "@prisma/client";
import { toast } from "sonner";

import {
  createInboxConversationAction,
  deleteInboxQuickReplyAction,
  markInboxConversationReadAction,
  saveInboxQuickReplyAction,
  updateInboxConversationStatusAction,
} from "@/lib/actions/inbox";
import type {
  InboxAssigneeFilter,
  InboxConversationListItem,
  InboxCustomerContext,
  InboxStatusFilter,
  InboxThread,
  InboxWorkspaceContext,
  ServiceWindow,
} from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { InboxPoller } from "@/components/inbox/inbox-poller";
import { ConversationPanel } from "@/components/inbox/conversation-panel";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { ReplyComposer } from "@/components/inbox/reply-composer";
import { announceInboxChange } from "@/components/dashboard/inbox-nav-badge";

type Props = {
  conversations: InboxConversationListItem[];
  hasMore: boolean;
  nextTake: number;
  counts: { open: number; unread: number };
  thread: InboxThread | null;
  customer: InboxCustomerContext | null;
  context: InboxWorkspaceContext;
  integration: Pick<
    IntegrationSetting,
    "whatsappProvider" | "whatsappIsActive" | "whatsappSenderNumber"
  > | null;
  window: ServiceWindow | null;
  filters: { q: string; status: InboxStatusFilter; assignee: InboxAssigneeFilter };
};

const statusLabel: Record<InboxConversationStatus, string> = {
  OPEN: "Open",
  PENDING: "Pending",
  RESOLVED: "Selesai",
  SPAM: "Spam",
};

const STATUS_FILTERS: { key: InboxStatusFilter; label: string }[] = [
  { key: "all", label: "Semua status" },
  { key: "unread", label: "Belum dibaca" },
  { key: "OPEN", label: "Open" },
  { key: "PENDING", label: "Pending" },
  { key: "RESOLVED", label: "Selesai" },
  { key: "SPAM", label: "Spam" },
];

/**
 * Builds a link that keeps the filters already in the URL.
 *
 * The inbox keeps its state there — which conversation is open, the search, the
 * filters, how much history is loaded — so a refresh, a poll, or a shared link
 * all land on the same view.
 */
function useInboxHref() {
  const params = useSearchParams();
  return useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params?.toString() ?? "");
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === "") sp.delete(key);
        else sp.set(key, value);
      }
      const qs = sp.toString();
      return qs ? `/dashboard/inbox?${qs}` : "/dashboard/inbox";
    },
    [params]
  );
}

export function InboxWorkspace({
  conversations,
  hasMore,
  nextTake,
  counts,
  thread,
  customer,
  context,
  integration,
  window: serviceWindow,
  filters,
}: Props) {
  const router = useRouter();
  const href = useInboxHref();
  const params = useSearchParams();
  const active = thread?.conversation ?? null;
  // The server opens the newest conversation by default so the desktop's middle
  // column is never empty. On a phone that default must not count as "the
  // operator opened a thread" — treating it that way hid the list behind a
  // conversation nobody had picked, with no way back to it.
  const threadOpen = Boolean(params?.get("c"));
  // A reply shows immediately; the server's copy replaces it on the next render.
  const [pendingReplies, setPendingReplies] = useState<string[]>([]);
  const messageListRef = useScrollToLatest(
    active?.id ?? null,
    `${thread?.messages.at(-1)?.id ?? ""}:${pendingReplies.length}`,
    threadOpen
  );
  const serverCount = thread?.messages.length ?? 0;
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    setPendingReplies([]);
  }, [serverCount, active?.id]);
  // Opening another conversation should not leave the previous one's details
  // hanging over it.
  useEffect(() => {
    setDetailsOpen(false);
  }, [active?.id]);

  const refresh = useCallback(() => {
    router.refresh();
    announceInboxChange();
  }, [router]);

  const filtered = Boolean(filters.q) || filters.status !== "all" || filters.assignee !== "all";
  // A brand-new inbox gets one setup card instead of two empty panes.
  const firstRun = conversations.length === 0 && !filtered;
  const connected = Boolean(integration?.whatsappIsActive);

  return (
    <div
      data-inbox-shell=""
      className={cn(
        "flex min-w-0 flex-col overflow-hidden bg-kv-card",
        // On a phone the inbox is a full-screen surface under the 48px topbar,
        // one pane at a time.
        "fixed inset-x-0 bottom-0 top-[48px] z-20",
        // From lg it sits in the page like a panel and takes exactly the height
        // left under the topbar and the shell's 4px + 16px padding. (It used
        // to pull itself up with negative margins sized for the old, roomier
        // shell, which slid it over the breadcrumb.)
        "lg:static lg:z-auto lg:h-[calc(100dvh-68px)] lg:rounded-[12px] lg:border-[0.8px] lg:border-kv-border"
      )}
    >
      <InboxPoller />

      <header
        className={cn(
          "shrink-0 items-center justify-between gap-[12px] border-b-[0.8px] border-kv-border px-[14px] py-[10px]",
          threadOpen ? "hidden lg:flex" : "flex"
        )}
      >
        <div className="flex min-w-0 items-center gap-[10px]">
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-kv-fg">Inbox</h1>
          <ChannelStatus integration={integration} />
        </div>
        <div className="flex shrink-0 items-center gap-[6px]">
          <QuickReplyManager quickReplies={context.quickReplies} onChanged={refresh} />
          <NewMessageDialog />
          {!connected ? (
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/dashboard/settings/integrations">
                <Smartphone /> Hubungkan WhatsApp
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {firstRun ? (
        <InboxSetup connected={connected} integration={integration} />
      ) : (
        <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_300px]">
          <aside
            className={cn(
              "min-h-0 min-w-0 flex-col bg-kv-card lg:flex lg:border-r-[0.8px] lg:border-kv-border",
              threadOpen ? "hidden" : "flex"
            )}
          >
            <div className="shrink-0 space-y-[8px] border-b-[0.8px] border-kv-border p-[10px]">
              <SearchBox defaultValue={filters.q} />
              <div className="grid grid-cols-2 gap-[6px]">
                <FilterSelect
                  label="Filter status"
                  value={filters.status}
                  options={STATUS_FILTERS.map((item) => ({
                    value: item.key,
                    label:
                      item.key === "unread" && counts.unread > 0
                        ? `${item.label} (${counts.unread})`
                        : item.key === "OPEN" && counts.open > 0
                          ? `${item.label} (${counts.open})`
                          : item.label,
                  }))}
                  onChange={(value) =>
                    // A new filter starts a fresh page and drops the open
                    // thread, which may not be in the filtered list at all.
                    router.push(href({ status: value === "all" ? null : value, show: null, c: null, msgs: null }), {
                      scroll: false,
                    })
                  }
                />
                <FilterSelect
                  label="Filter petugas"
                  value={filters.assignee}
                  options={[
                    { value: "all", label: "Semua petugas" },
                    { value: "mine", label: "Ditugaskan ke saya" },
                    { value: "unassigned", label: "Belum ditugaskan" },
                  ]}
                  onChange={(value) =>
                    router.push(href({ assignee: value === "all" ? null : value, show: null, c: null, msgs: null }), {
                      scroll: false,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-[8px] px-[14px] py-[8px] text-[11px] text-kv-muted-fg">
              <span className="uppercase tracking-[0.06em]">
                {conversations.length}
                {hasMore ? "+" : ""} percakapan
              </span>
              {filtered ? (
                <Link href="/dashboard/inbox" scroll={false} className="font-medium text-kv-fg underline-offset-4 hover:underline">
                  Reset filter
                </Link>
              ) : counts.unread > 0 ? (
                <Link
                  href={href({ status: "unread", show: null, c: null, msgs: null })}
                  scroll={false}
                  className="inline-flex items-center gap-[5px] font-medium text-kv-fg"
                >
                  <span className="h-[6px] w-[6px] rounded-full bg-kv-success" />
                  {counts.unread} belum dibaca
                </Link>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-[6px] px-[24px] text-center">
                  <Search className="h-[18px] w-[18px] text-kv-subtle" strokeWidth={1.6} />
                  <p className="text-[13px] font-medium text-kv-fg">Tidak ada yang cocok</p>
                  <p className="text-[12px] text-kv-muted-fg">Coba kata kunci lain atau ganti filter.</p>
                </div>
              ) : (
                <>
                  {conversations.map((conversation) => {
                    const name = conversation.contactName || formatPhone(conversation.contactPhone);
                    const unread = conversation.unreadCount > 0;
                    const selected = active?.id === conversation.id;
                    return (
                      <Link
                        key={conversation.id}
                        href={href({ c: conversation.id, msgs: null })}
                        scroll={false}
                        title={conversation.contactPhone}
                        aria-current={selected ? "true" : undefined}
                        className={cn(
                          "relative flex w-full gap-[10px] border-b border-black/[0.05] px-[14px] py-[11px] text-left transition-colors",
                          selected
                            ? "bg-kv-secondary before:absolute before:inset-y-[10px] before:left-0 before:w-[2px] before:rounded-full before:bg-kv-fg before:content-['']"
                            : "hover:bg-kv-hover"
                        )}
                      >
                        <ContactAvatar name={name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-[8px]">
                            <p className={cn("truncate text-[13px] text-kv-fg", unread ? "font-semibold" : "font-medium")}>
                              {name}
                            </p>
                            <LocalTime value={conversation.lastMessageAt} className={unread ? "font-medium text-kv-fg" : undefined} />
                          </div>
                          <div className="mt-[3px] flex items-center justify-between gap-[8px]">
                            <p className={cn("truncate text-[12px]", unread ? "text-kv-cell" : "text-kv-muted-fg")}>
                              {conversation.lastMessagePreview || "Belum ada isi pesan"}
                            </p>
                            {unread ? (
                              <span className="kv-gradient kv-tabular flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-[5px] text-[10px] font-semibold text-white">
                                {conversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                          {conversation.labels.length > 0 || conversation.assignedTo || conversation.status !== "OPEN" ? (
                            <div className="mt-[6px] flex flex-wrap items-center gap-[4px]">
                              {conversation.status !== "OPEN" ? <StatusPill status={conversation.status} /> : null}
                              {conversation.labels.map((label) => (
                                <span
                                  key={label.id}
                                  className="inline-flex h-[18px] items-center gap-[4px] rounded-[5px] border-[0.8px] border-kv-border bg-kv-card px-[5px] text-[10px] font-medium text-kv-secondary-fg"
                                >
                                  <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: label.color }} />
                                  {label.name}
                                </span>
                              ))}
                              {conversation.assignedTo ? (
                                <span className="inline-flex h-[18px] items-center rounded-[5px] bg-kv-accent px-[5px] text-[10px] text-kv-secondary-fg">
                                  @{conversation.assignedTo.name ?? conversation.assignedTo.email}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                  {hasMore ? (
                    <div className="p-[10px]">
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <Link href={href({ show: String(nextTake) })} scroll={false}>
                          Muat lebih banyak
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </aside>

          <section className={cn("min-h-0 min-w-0 flex-col lg:flex", threadOpen ? "flex" : "hidden")}>
            {thread && active ? (
              <>
                <MarkRead conversationId={active.id} unreadCount={active.unreadCount} />
                <div className="flex shrink-0 items-center gap-[10px] border-b-[0.8px] border-kv-border px-[10px] py-[8px] md:px-[16px] md:py-[10px]">
                  {/* The list is a separate pane on a phone, so the thread
                      needs a way back to it. */}
                  <Button variant="ghost" size="icon" asChild className="-ml-[4px] shrink-0 lg:hidden">
                    <Link href={href({ c: null, msgs: null })} scroll={false} aria-label="Kembali ke daftar percakapan">
                      <ArrowLeft />
                    </Link>
                  </Button>
                  <ContactAvatar name={active.contactName || active.contactPhone} className="hidden sm:flex" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-kv-fg">{active.contactName || formatPhone(active.contactPhone)}</p>
                    <p className="truncate text-[12px] text-kv-muted-fg">
                      {formatPhone(active.contactPhone)}
                      {active.customer?.email ? ` · ${active.customer.email}` : ""}
                    </p>
                  </div>
                  <StatusPill status={active.status} className="hidden sm:inline-flex" />
                  {/* One contextual action: finishing an open chat, or reopening
                      a finished one. */}
                  {active.status === "RESOLVED" || active.status === "SPAM" ? (
                    <StatusButton conversationId={active.id} status="OPEN" label="Buka lagi" icon={RotateCcw} />
                  ) : (
                    <StatusButton conversationId={active.id} status="RESOLVED" label="Selesaikan" icon={Check} />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 xl:hidden"
                    onClick={() => setDetailsOpen(true)}
                    aria-label="Buka detail percakapan"
                  >
                    <PanelRight />
                    <span className="hidden sm:inline">Detail</span>
                  </Button>
                </div>

                <div ref={messageListRef} data-inbox-messages="" className="min-h-0 flex-1 overflow-y-auto bg-kv-bg px-[12px] py-[14px] md:px-[20px]">
                  {thread.hasOlder ? (
                    <div className="flex justify-center pb-[10px]">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={href({ msgs: String(thread.nextTake) })} scroll={false}>
                          Muat pesan lama
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                  <MessageList messages={thread.messages} />
                  {pendingReplies.map((text, index) => (
                    <div key={`pending-${index}`} className="mt-[8px] flex justify-end">
                      <div className="kv-gradient min-w-0 max-w-[85%] animate-pulse overflow-hidden rounded-[14px] rounded-br-[4px] px-[12px] py-[8px] text-[13px] text-white opacity-80 sm:max-w-[72%]">
                        <p className="whitespace-pre-wrap break-words leading-[1.5] [overflow-wrap:anywhere]">{text}</p>
                        <p className="mt-[4px] text-right text-[10px] text-white/60">mengirim…</p>
                      </div>
                    </div>
                  ))}
                </div>

                <ReplyComposer
                  conversationId={active.id}
                  enabled={connected}
                  window={serviceWindow}
                  quickReplies={context.quickReplies}
                  onSent={(text) => {
                    setPendingReplies((current) => [...current, text]);
                    refresh();
                  }}
                />
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-[6px] bg-kv-bg px-[24px] text-center">
                <MessageCircle className="h-[20px] w-[20px] text-kv-subtle" strokeWidth={1.6} />
                <p className="text-[13px] font-medium text-kv-fg">Pilih percakapan</p>
                <p className="text-[12px] text-kv-muted-fg">Pesan dan balasannya tampil di sini.</p>
              </div>
            )}
          </section>

          {thread ? (
            <ConversationPanel
              className="hidden xl:flex"
              thread={thread}
              customer={customer}
              context={context}
              onChanged={refresh}
            />
          ) : null}
        </div>
      )}

      {thread && active ? (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b-[0.8px] border-kv-border px-[16px] py-[12px] text-left">
              <SheetTitle className="flex items-center gap-[8px] truncate text-[15px]">
                {active.contactName || active.contactPhone}
                <StatusPill status={active.status} />
              </SheetTitle>
            </SheetHeader>
            <ConversationPanel
              className="flex-1 border-t-0"
              thread={thread}
              customer={customer}
              context={context}
              onChanged={refresh}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

/**
 * Opens a thread at its newest message, and follows new ones as they arrive.
 *
 * The list is scrolled to the top by default, so a conversation opened at 60
 * messages showed the middle of last week rather than what was just asked.
 * Loading older messages deliberately does not re-scroll: the key is the newest
 * message, which does not change when history is prepended.
 */
function useScrollToLatest(
  conversationId: string | null,
  latestMessageId: string,
  /**
   * Whether the pane is actually on screen. On a phone the thread starts
   * hidden behind the list, and a hidden element has no scrollHeight — the
   * scroll silently did nothing and the conversation opened at its oldest
   * message. Opening it is not a remount either (the server had already picked
   * that thread), so visibility has to drive this on its own.
   */
  visible = true
) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !visible) return;
    // One frame later: the pane is un-hidden in this very commit and can still
    // measure 0 when the effect runs.
    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, latestMessageId, visible]);

  return ref;
}

/**
 * Times are rendered after mount.
 *
 * The server runs in UTC and the operator does not, so formatting during SSR
 * would hand React a different string than the browser produces.
 */
function LocalTime({
  value,
  className,
}: {
  value: Date | string | null;
  className?: string;
}) {
  const [text, setText] = useState("");
  const stamp = value ? new Date(value).getTime() : null;

  useEffect(() => {
    if (stamp === null || Number.isNaN(stamp)) {
      setText("");
      return;
    }
    const date = new Date(stamp);
    const sameDay = date.toDateString() === new Date().toDateString();
    setText(
      sameDay
        ? date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
    );
  }, [stamp]);

  return (
    <span className={cn("kv-tabular shrink-0 text-[11px] text-kv-subtle", className)}>
      {text}
    </span>
  );
}

/** Zeroes the badge once the thread is actually on screen. */
function MarkRead({
  conversationId,
  unreadCount,
}: {
  conversationId: string;
  unreadCount: number;
}) {
  const router = useRouter();
  const marked = useRef<string | null>(null);

  useEffect(() => {
    if (unreadCount <= 0) return;
    if (marked.current === conversationId) return;
    marked.current = conversationId;
    void markInboxConversationReadAction(conversationId).then(() => {
      // Refresh clears the per-conversation badge in the list; the event tells
      // the sidebar badge, which lives outside this route, to re-check.
      router.refresh();
      announceInboxChange();
    });
  }, [conversationId, unreadCount, router]);

  return null;
}

function SearchBox({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const href = useInboxHref();
  const [value, setValue] = useState(defaultValue);

  // `href` is rebuilt whenever useSearchParams returns a new object, so having
  // it in the effect's deps cleared and restarted the debounce on every render
  // — with anything else re-rendering, the search never fired.
  const hrefRef = useRef(href);
  hrefRef.current = href;

  // Keep in step when the URL changes from somewhere else (a filter, a poll).
  useEffect(() => setValue(defaultValue), [defaultValue]);

  useEffect(() => {
    const next = value.trim();
    if (next === defaultValue) return;
    const timer = window.setTimeout(() => {
      router.replace(
        hrefRef.current({ q: next || null, show: null, c: null, msgs: null }),
        { scroll: false }
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [value, defaultValue, router]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-[10px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-kv-muted-fg" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Cari nama, nomor, atau isi pesan"
        className="h-[32px] max-w-none pl-[32px]"
        aria-label="Cari percakapan"
      />
    </div>
  );
}

/** 6281234567890 → +62 812-3456-7890; anything else is shown as stored. */
function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits.startsWith("62") || digits.length < 10) return raw;
  const rest = digits.slice(2);
  return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`.replace(/-$/, "");
}

const STATUS_STYLE: Record<InboxConversationStatus, string> = {
  OPEN: "bg-kv-success",
  PENDING: "bg-amber-500",
  RESOLVED: "bg-kv-subtle",
  SPAM: "bg-kv-destructive",
};

function StatusPill({ status, className }: { status: InboxConversationStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[20px] shrink-0 items-center gap-[5px] rounded-[6px] border-[0.8px] border-kv-border bg-kv-card px-[6px] text-[11px] font-medium text-kv-secondary-fg",
        className
      )}
    >
      <span className={cn("h-[6px] w-[6px] rounded-full", STATUS_STYLE[status])} />
      {statusLabel[status]}
    </span>
  );
}

const AVATAR_TONES = [
  "bg-[#e0e7ff] text-[#3730a3]",
  "bg-[#dcfce7] text-[#166534]",
  "bg-[#fef3c7] text-[#92400e]",
  "bg-[#fce7f3] text-[#9d174d]",
  "bg-[#e0f2fe] text-[#075985]",
  "bg-[#f3e8ff] text-[#6b21a8]",
];

/** Initials on a colour picked from the name, so contacts tell apart at a glance. */
function ContactAvatar({ name, className }: { name: string; className?: string }) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
        AVATAR_TONES[hash % AVATAR_TONES.length],
        className
      )}
    >
      {initials}
    </span>
  );
}

function ChannelStatus({ integration }: { integration: Props["integration"] }) {
  const on = Boolean(integration?.whatsappIsActive);
  return (
    <span
      className="inline-flex h-[24px] min-w-0 items-center gap-[6px] rounded-[7px] border-[0.8px] border-kv-border bg-kv-card px-[8px] text-[12px] text-kv-secondary-fg"
      title={on ? `Terhubung lewat ${integration?.whatsappProvider}` : "WhatsApp belum terhubung"}
    >
      <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", on ? "bg-kv-success" : "bg-amber-500")} />
      <span className="truncate">
        {on ? integration?.whatsappSenderNumber || "WhatsApp aktif" : "WhatsApp belum terhubung"}
      </span>
    </span>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-[30px] w-full min-w-0 cursor-pointer appearance-none truncate rounded-[8px] border-[0.8px] bg-kv-card pl-[10px] pr-[26px] text-[12px] outline-none transition-colors hover:border-[#d1d5db] focus-visible:border-[#9ca3af]",
          value === "all" ? "border-kv-border text-kv-secondary-fg" : "border-kv-fg font-medium text-kv-fg"
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[8px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-kv-muted-fg" />
    </div>
  );
}

/** First run: what to do next, in one place, instead of two empty panes. */
function InboxSetup({
  connected,
  integration,
}: {
  connected: boolean;
  integration: Props["integration"];
}) {
  const steps = [
    {
      done: connected,
      title: connected ? `WhatsApp terhubung${integration?.whatsappProvider ? ` (${integration.whatsappProvider})` : ""}` : "Hubungkan WhatsApp",
      body: connected
        ? "Pesan dari pelanggan masuk ke inbox ini secara otomatis."
        : "Pasang provider WhatsApp di Integrasi supaya pesan pelanggan masuk dan balasanmu terkirim.",
      action: connected ? null : (
        <Button size="sm" asChild>
          <Link href="/dashboard/settings/integrations">
            <Smartphone /> Buka Integrasi
          </Link>
        </Button>
      ),
    },
    {
      done: false,
      title: "Coba dengan pesan simulasi",
      body: "Buat satu pesan masuk palsu untuk melihat alur balas, label, dan catatan sebelum pelanggan asli menulis.",
      action: <NewMessageDialog />,
    },
    {
      done: false,
      title: "Siapkan balasan cepat",
      body: "Simpan jawaban yang sering dipakai (ongkir, rekening, jam buka), lalu sisipkan dengan mengetik /.",
      action: null,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-kv-bg p-[16px]">
      <div className="w-full max-w-[520px] animate-kv-rise">
        <div className="mb-[16px] text-center">
          <span className="mx-auto flex h-[40px] w-[40px] items-center justify-center rounded-full border-[0.8px] border-kv-border bg-kv-card">
            <MessageCircle className="h-[18px] w-[18px] text-kv-secondary-fg" strokeWidth={1.6} />
          </span>
          <h2 className="mt-[12px] text-[17px] font-semibold text-kv-fg">Belum ada percakapan</h2>
          <p className="mt-[4px] text-[13px] text-kv-muted-fg">Semua chat WhatsApp pelanggan akan berkumpul di sini.</p>
        </div>
        <ol className="kv-frame flex flex-col gap-[4px] p-[4px]">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-[12px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-card p-[14px]">
              <span
                className={cn(
                  "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  step.done ? "bg-kv-success text-white" : "border-[0.8px] border-kv-border text-kv-secondary-fg"
                )}
              >
                {step.done ? <Check className="h-[12px] w-[12px]" strokeWidth={3} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-kv-fg">{step.title}</p>
                <p className="mt-[2px] text-[12px] leading-[1.5] text-kv-muted-fg">{step.body}</p>
                {step.action ? <div className="mt-[10px]">{step.action}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Messages with a divider wherever the day changes. Dividers wait for mount:
 * "which day" depends on the operator's zone, which the server doesn't know.
 */
function MessageList({ messages }: { messages: InboxThread["messages"] }) {
  const [dayOf, setDayOf] = useState<((value: Date | string) => string) | null>(null);
  useEffect(() => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();
    setDayOf(() => (value: Date | string) => {
      const date = new Date(value);
      const key = date.toDateString();
      if (key === today) return "Hari ini";
      if (key === yesterday) return "Kemarin";
      return date.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
    });
  }, []);

  let previous = "";
  return (
    <div className="space-y-[8px]">
      {messages.map((message) => {
        const day = dayOf ? dayOf(message.createdAt) : "";
        const divider = day && day !== previous ? day : null;
        previous = day || previous;
        return (
          <div key={message.id}>
            {divider ? (
              <div className="my-[12px] flex items-center justify-center">
                <span className="rounded-full border-[0.8px] border-kv-border bg-kv-card px-[10px] py-[2px] text-[11px] font-medium text-kv-muted-fg">
                  {divider}
                </span>
              </div>
            ) : null}
            <MessageBubble message={message} timestamp={<LocalTime value={message.createdAt} />} />
          </div>
        );
      })}
    </div>
  );
}

function StatusButton({
  conversationId,
  status,
  label,
  icon: Icon,
}: {
  conversationId: string;
  status: InboxConversationStatus;
  label: string;
  icon: typeof MessageCircle;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0"
      // The label is hidden on phones; the name must not be.
      aria-label={label}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await updateInboxConversationStatusAction(conversationId, status);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          router.refresh();
          announceInboxChange();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Icon />}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

/** Canned replies live per workspace; this is where they are written. */
function QuickReplyManager({
  quickReplies,
  onChanged,
}: {
  quickReplies: InboxWorkspaceContext["quickReplies"];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Balasan cepat">
          <Zap />
          <span className="hidden md:inline">Balasan cepat</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Balasan cepat</DialogTitle>
          <DialogDescription>
            Ketik <code>/shortcut</code> di kolom balasan untuk menyisipkannya.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) =>
            startTransition(async () => {
              const res = await saveInboxQuickReplyAction(formData);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success("Balasan cepat disimpan");
              onChanged();
            })
          }
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="quick-shortcut">Shortcut</Label>
            <Input
              id="quick-shortcut"
              name="shortcut"
              required
              maxLength={32}
              placeholder="ongkir"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick-body">Isi</Label>
            <Textarea
              id="quick-body"
              name="body"
              rows={3}
              required
              placeholder="Ongkir ke alamat Anda Rp..."
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </form>

        {quickReplies.length > 0 ? (
          <ul className="max-h-60 space-y-[6px] overflow-y-auto border-t-[0.8px] border-kv-border pt-[12px]">
            {quickReplies.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-[8px] rounded-[8px] border-[0.8px] border-kv-border px-[10px] py-[8px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[12px] font-medium text-kv-fg">/{item.shortcut}</p>
                  <p className="line-clamp-2 text-[12px] text-kv-muted-fg">{item.body}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Hapus /${item.shortcut}`}
                  className="rounded-[5px] p-[3px] text-kv-muted-fg transition-colors hover:bg-kv-hover hover:text-kv-destructive"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteInboxQuickReplyAction(item.id);
                      if (!res.ok) toast.error(res.error);
                      else onChanged();
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewMessageDialog() {
  const router = useRouter();
  const href = useInboxHref();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Simulasi pesan masuk">
          <FlaskConical />
          <span className="hidden md:inline">Simulasi pesan</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Simulasi Pesan WhatsApp</DialogTitle>
          <DialogDescription>
            Gunakan ini untuk mengetes inbox sebelum webhook provider aktif.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) =>
            startTransition(async () => {
              const res = await createInboxConversationAction(formData);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success("Pesan masuk dibuat");
              setOpen(false);
              announceInboxChange();
              // Open what was just created instead of leaving it to be hunted.
              router.push(
                href({ c: res.data?.conversationId ?? null, msgs: null, q: null }),
                { scroll: false }
              );
            })
          }
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Nama</Label>
            <Input name="name" placeholder="Nama customer" />
          </div>
          <div className="space-y-2">
            <Label>Nomor WhatsApp</Label>
            <Input name="phone" placeholder="6281234567890" required />
          </div>
          <div className="space-y-2">
            <Label>Pesan</Label>
            <Textarea name="body" rows={4} required placeholder="Halo, saya mau tanya produk..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Membuat..." : "Buat Pesan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
