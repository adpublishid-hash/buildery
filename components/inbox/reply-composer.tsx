"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Send, Zap } from "lucide-react";
import { toast } from "sonner";

import { sendInboxReplyAction } from "@/lib/actions/inbox";
import type { InboxWorkspaceContext, ServiceWindow } from "@/lib/inbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Writing a reply.
 *
 * Three things it now refuses to let an operator get wrong: sending into a
 * closed WhatsApp service window (the Cloud API would reject it), retyping the
 * same answer for the tenth time, and staring at a composer that looks like
 * nothing happened while the round trip completes.
 */
export function ReplyComposer({
  conversationId,
  enabled,
  window: serviceWindow,
  quickReplies,
  onSent,
}: {
  conversationId: string;
  enabled: boolean;
  window: ServiceWindow | null;
  quickReplies: InboxWorkspaceContext["quickReplies"];
  onSent: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const textarea = useRef<HTMLTextAreaElement>(null);

  const windowClosed = Boolean(serviceWindow?.enforced && !serviceWindow.open);
  const blocked = windowClosed || !enabled;

  // Typing "/shortcut" filters the canned replies, the way a chat app does.
  const slashQuery = useMemo(() => {
    const match = /^\/([a-z0-9-_]*)$/i.exec(body.trim());
    return match ? match[1].toLowerCase() : null;
  }, [body]);

  const suggestions = useMemo(() => {
    if (slashQuery === null && !pickerOpen) return [];
    const query = slashQuery ?? "";
    return quickReplies.filter((item) => item.shortcut.startsWith(query));
  }, [pickerOpen, quickReplies, slashQuery]);

  function insert(text: string) {
    setBody((current) => {
      // Typing "/ongkir" is a lookup and gets replaced; anything else the
      // operator has already written is kept and appended to.
      if (slashQuery !== null || !current.trim()) return text;
      return `${current.trimEnd()}\n${text}`;
    });
    setPickerOpen(false);
    textarea.current?.focus();
  }

  return (
    <div className="min-w-0 shrink-0 border-t-[0.8px] border-kv-border bg-kv-card">
      {!enabled ? (
        <div className="flex items-start gap-[8px] border-b-[0.8px] border-kv-border bg-amber-50/60 px-[14px] py-[8px] text-[12px] leading-[1.5] text-amber-900">
          <span className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full bg-amber-500" />
          <span>
          Provider WhatsApp belum aktif, jadi balasan tidak bisa dikirim.{" "}
          <Link href="/dashboard/settings/integrations" className="font-medium underline underline-offset-2">
            Aktifkan di Pengaturan → Integrasi
          </Link>
          .
          </span>
        </div>
      ) : null}

      {windowClosed ? (
        <div className="flex items-start gap-[8px] border-b-[0.8px] border-kv-border bg-amber-50/60 px-[14px] py-[8px] text-[12px] leading-[1.5] text-amber-900">
          <span className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full bg-amber-500" />
          <span>
          Jendela 24 jam WhatsApp sudah lewat
          {serviceWindow?.expiresAt ? (
            <RelativeExpiry expiresAt={serviceWindow.expiresAt} />
          ) : null}
          . WhatsApp menolak balasan bebas sampai pelanggan menulis lagi — kirim{" "}
          <Link href="/dashboard/settings/integrations" className="font-medium underline underline-offset-2">
            template yang sudah disetujui
          </Link>
          .
          </span>
        </div>
      ) : serviceWindow?.enforced && serviceWindow.expiresAt ? (
        <div className="border-b-[0.8px] border-kv-border px-[14px] py-[6px] text-[11px] text-kv-muted-fg">
          Jendela balasan bebas tutup <RelativeExpiry expiresAt={serviceWindow.expiresAt} />
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto border-b-[0.8px] border-kv-border">
          {suggestions.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => insert(item.body)}
                className="flex w-full flex-col gap-[2px] px-[14px] py-[8px] text-left transition-colors hover:bg-kv-hover"
              >
                <span className="font-mono text-[12px] font-medium text-kv-fg">
                  /{item.shortcut}
                </span>
                <span className="line-clamp-2 text-[12px] text-kv-muted-fg">
                  {item.body}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        action={(formData) =>
          startTransition(async () => {
            const text = String(formData.get("body") || "");
            const res = await sendInboxReplyAction(conversationId, formData);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            setBody("");
            onSent(text);
            toast.success("Balasan masuk antrean kirim");
          })
        }
        className="p-[10px] md:p-[12px]"
      >
        <div className="rounded-[10px] border-[0.8px] border-kv-border bg-kv-card transition-[border-color,box-shadow] focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]">
        <Textarea
          ref={textarea}
          name="body"
          rows={3}
          value={body}
          disabled={blocked}
          className="max-h-40 min-h-[64px] max-w-none resize-none border-0 bg-transparent text-base shadow-none hover:border-0 focus-visible:shadow-none md:min-h-[56px] md:text-[13px]"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Plain Enter keeps the new line WhatsApp messages often need.
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (!pending && !blocked && body.trim()) event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={
            windowClosed
              ? "Tunggu pelanggan menulis lagi, atau kirim template."
              : enabled
                ? "Tulis balasan…"
                : "Aktifkan integrasi WhatsApp sebelum mengirim balasan..."
          }
          aria-label="Balasan WhatsApp"
        />
        <div className="flex items-center gap-[8px] border-t-[0.8px] border-kv-border px-[8px] py-[6px]">
          <div className="flex min-w-0 flex-1 items-center gap-[8px]">
            {quickReplies.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPickerOpen((open) => !open)}
                className={cn("shrink-0", pickerOpen && "bg-kv-secondary")}
              >
                <Zap />
                <span className="hidden sm:inline">Balasan cepat</span>
              </Button>
            ) : null}
            {/* The explainer is desktop furniture; on a phone it stole the row
                the send button needs. */}
            <p className="hidden min-w-0 truncate text-[11px] text-kv-subtle md:block">
              <kbd className="font-sans">⌘/Ctrl</kbd> + <kbd className="font-sans">Enter</kbd> untuk kirim · ketik / untuk balasan cepat
            </p>
          </div>
          <Button
            type="submit"
            size="sm"
            className="shrink-0"
            disabled={pending || blocked || !body.trim()}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            {pending ? "Mengirim..." : "Kirim"}
          </Button>
        </div>
        </div>
      </form>
    </div>
  );
}

/** Rendered after mount: the server and the operator are in different zones. */
function RelativeExpiry({ expiresAt }: { expiresAt: Date }) {
  const [text, setText] = useState("");
  const stamp = new Date(expiresAt).getTime();

  useEffect(() => {
    function render() {
      const diff = stamp - Date.now();
      const hours = Math.round(Math.abs(diff) / (60 * 60 * 1000));
      const label =
        hours >= 24
          ? `${Math.round(hours / 24)} hari`
          : hours >= 1
            ? `${hours} jam`
            : "kurang dari 1 jam";
      setText(diff > 0 ? ` dalam ${label}` : ` ${label} lalu`);
    }
    render();
    const timer = window.setInterval(render, 60_000);
    return () => window.clearInterval(timer);
  }, [stamp]);

  return <span>{text}</span>;
}
