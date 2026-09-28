"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ShoppingBag, StickyNote, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import {
  addInboxNoteAction,
  assignInboxConversationAction,
  createInboxLabelAction,
  deleteInboxNoteAction,
  toggleInboxLabelAction,
} from "@/lib/actions/inbox";
import type { InboxChannel } from "@prisma/client";
import type { InboxCustomerContext, InboxThread, InboxWorkspaceContext } from "@/lib/inbox";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Everything about a conversation that is not the conversation: who owns it,
 * what it is about, who the customer is, and what the team has said privately.
 *
 * Answering "where is my order?" used to mean leaving the inbox to look it up.
 */
export function ConversationPanel({
  thread,
  customer,
  context,
  onChanged,
  className,
}: {
  thread: InboxThread;
  customer: InboxCustomerContext | null;
  context: InboxWorkspaceContext;
  onChanged: () => void;
  /** The workspace renders this as a sidebar on a wide screen and inside a
   *  sheet on everything narrower, so the outer box is its caller's call. */
  className?: string;
}) {
  const conversation = thread.conversation;

  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-[10px] overflow-y-auto border-t-[0.8px] border-kv-border bg-kv-bg p-[10px] xl:border-l-[0.8px] xl:border-t-0",
        className
      )}
    >
      <Assignee
        conversationId={conversation.id}
        assignedToId={conversation.assignedTo?.id ?? null}
        members={context.members}
        onChanged={onChanged}
      />
      <Labels
        conversationId={conversation.id}
        attached={conversation.labels}
        all={context.labels}
        onChanged={onChanged}
      />
      <CustomerCard phone={conversation.contactPhone} channel={conversation.channel} customer={customer} />
      <Notes
        conversationId={conversation.id}
        notes={conversation.notes}
        onChanged={onChanged}
      />
    </aside>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ElementType;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="kv-frame flex flex-col p-[4px]">
      <div className="flex min-h-[28px] items-center gap-[6px] px-[8px] py-[4px]">
        <Icon className="h-[13px] w-[13px] text-kv-secondary-fg" strokeWidth={1.6} />
        <h3 className="text-[12px] font-medium text-kv-secondary-fg">{title}</h3>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className="rounded-[9px] border-[0.8px] border-kv-border bg-kv-card p-[10px]">{children}</div>
    </section>
  );
}

function Assignee({
  conversationId,
  assignedToId,
  members,
  onChanged,
}: {
  conversationId: string;
  assignedToId: string | null;
  members: InboxWorkspaceContext["members"];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Section icon={UserRound} title="Petugas">
      <select
        aria-label="Petugas percakapan"
        className="h-[30px] w-full rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[8px] text-[12px] text-kv-fg outline-none hover:border-[#d1d5db] focus-visible:border-[#9ca3af] disabled:opacity-60"
        value={assignedToId ?? ""}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value || null;
          startTransition(async () => {
            const res = await assignInboxConversationAction(conversationId, next);
            if (!res.ok) toast.error(res.error);
            else onChanged();
          });
        }}
      >
        <option value="">Belum ditugaskan</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name ?? member.email}
          </option>
        ))}
      </select>
    </Section>
  );
}

function Labels({
  conversationId,
  attached,
  all,
  onChanged,
}: {
  conversationId: string;
  attached: { id: string; name: string; color: string }[];
  all: InboxWorkspaceContext["labels"];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const attachedIds = new Set(attached.map((label) => label.id));
  const available = all.filter((label) => !attachedIds.has(label.id));

  function toggle(labelId: string, attach: boolean) {
    startTransition(async () => {
      const res = await toggleInboxLabelAction(conversationId, labelId, attach);
      if (!res.ok) toast.error(res.error);
      else onChanged();
    });
  }

  return (
    <Section
      icon={StickyNote}
      title="Label"
      action={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Tambah label"
          aria-expanded={adding}
          className="h-6 px-1.5"
          onClick={() => setAdding((open) => !open)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {attached.length === 0 ? (
          <p className="text-xs text-kv-subtle">Belum ada label.</p>
        ) : (
          attached.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(label.id, false)}
                aria-label={`Lepas label ${label.name}`}
                className="opacity-70 transition hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {adding ? (
        <div className="mt-2 space-y-2 border-t border-kv-border pt-2">
          {available.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {available.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(label.id, true)}
                  className="inline-flex items-center gap-1 rounded-full border border-kv-border px-2 py-0.5 text-[11px] transition hover:bg-kv-hover"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </button>
              ))}
            </div>
          ) : null}
          <NewLabelForm
            onCreated={(labelId) => {
              toggle(labelId, true);
              setAdding(false);
            }}
          />
        </div>
      ) : null}
    </Section>
  );
}

function NewLabelForm({ onCreated }: { onCreated: (labelId: string) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const res = await createInboxLabelAction(formData);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          if (res.data?.id) onCreated(res.data.id);
        })
      }
      className="flex gap-1.5"
    >
      <Input
        name="name"
        required
        maxLength={40}
        placeholder="Label baru"
        className="h-8 text-xs"
      />
      <input type="hidden" name="color" value="#3f3f46" />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8">
        Tambah
      </Button>
    </form>
  );
}

function CustomerCard({
  phone,
  channel,
  customer,
}: {
  phone: string;
  channel: InboxChannel;
  customer: InboxCustomerContext | null;
}) {
  if (!customer) {
    return (
      <Section icon={ShoppingBag} title="Pelanggan">
        <p className="text-xs leading-5 text-kv-muted-fg">
          {channel === "WHATSAPP"
            ? `Nomor ${phone} belum cocok dengan pelanggan mana pun. Nomor akan tertaut otomatis setelah mereka checkout dengan nomor ini.`
            : channel === "WEBCHAT"
              ? "Belum cocok dengan pelanggan. Pengunjung yang mengisi email di chat akan tertaut ke pelanggan dengan email yang sama."
              : "Channel ini tidak membagikan nomor atau email, jadi percakapan belum bisa ditautkan ke pelanggan."}
        </p>
      </Section>
    );
  }

  return (
    <Section icon={ShoppingBag} title="Pelanggan">
      <p className="truncate text-sm font-medium text-kv-fg">
        {customer.customer.name}
      </p>
      <p className="truncate text-xs text-kv-muted-fg">{customer.customer.email}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-[8px] bg-kv-secondary px-2 py-1.5">
          <p className="text-[11px] text-kv-muted-fg">Order lunas</p>
          <p className="text-sm font-semibold">{customer.paidOrders}</p>
        </div>
        <div className="rounded-[8px] bg-kv-secondary px-2 py-1.5">
          <p className="text-[11px] text-kv-muted-fg">Nilai seumur hidup</p>
          <p className="text-sm font-semibold">
            {formatPrice(customer.lifetimeValue)}
          </p>
        </div>
      </div>

      {customer.recentOrders.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {customer.recentOrders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/dashboard/orders/${order.id}`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition hover:bg-kv-hover"
              >
                <span className="truncate font-medium">#{order.orderNumber}</span>
                <span className="shrink-0 text-kv-muted-fg">
                  {formatPrice(order.total)}
                </span>
                <span className="shrink-0 text-[11px] text-kv-subtle">
                  {formatDate(order.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-kv-subtle">Belum ada pesanan.</p>
      )}
    </Section>
  );
}

function Notes({
  conversationId,
  notes,
  onChanged,
}: {
  conversationId: string;
  notes: InboxThread["conversation"]["notes"];
  onChanged: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Section icon={StickyNote} title="Catatan internal">
      <form
        action={(formData) =>
          startTransition(async () => {
            const res = await addInboxNoteAction(conversationId, formData);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            setBody("");
            onChanged();
          })
        }
        className="space-y-2"
      >
        <Textarea
          name="body"
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Hanya tim yang melihat ini..."
          className="text-xs"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending || !body.trim()}
          className="w-full"
        >
          Simpan catatan
        </Button>
      </form>

      {notes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className={cn(
                "rounded-[8px] border-l-2 border-amber-400 bg-amber-50/60 px-[10px] py-[8px] text-[12px]"
              )}
            >
              <p className="whitespace-pre-wrap break-words leading-5 text-kv-fg">
                {note.body}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-kv-muted-fg">
                <span className="truncate">
                  {note.author?.name ?? note.author?.email ?? "Tim"}
                </span>
                <span>·</span>
                <span>{formatDate(note.createdAt)}</span>
                <button
                  type="button"
                  aria-label="Hapus catatan"
                  className="ml-auto text-kv-subtle transition hover:text-kv-fg"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteInboxNoteAction(note.id);
                      if (!res.ok) toast.error(res.error);
                      else {
                        router.refresh();
                        onChanged();
                      }
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
