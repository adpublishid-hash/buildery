"use client";

import type { InboxMessage } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Image as ImageIcon,
  MapPin,
  Mic,
  Sticker,
  Video,
} from "lucide-react";

import { attachmentLabel, GRAPH_MEDIA_HOST } from "@/lib/whatsapp/inbox-parse";
import { cn } from "@/lib/utils";

type MessageWithAuthor = InboxMessage & {
  author?: { name: string | null; email: string } | null;
};

const STATUS_TEXT: Record<InboxMessage["status"], string> = {
  RECEIVED: "diterima",
  QUEUED: "antre",
  SENT: "terkirim",
  FAILED: "gagal",
};

const KIND_ICON = {
  IMAGE: ImageIcon,
  VIDEO: Video,
  AUDIO: Mic,
  DOCUMENT: FileText,
  STICKER: Sticker,
  LOCATION: MapPin,
} as const;

/**
 * WhatsApp Cloud API hands over a media id behind an authenticated Graph
 * endpoint, not a link anyone can open. Storing it keeps the reference; showing
 * it as a link would only ever give the operator a 401.
 */
function openableMediaUrl(url: string | null) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).host === GRAPH_MEDIA_HOST ? null : url;
  } catch {
    return null;
  }
}

export function MessageBubble({
  message,
  timestamp,
}: {
  message: MessageWithAuthor;
  timestamp: React.ReactNode;
}) {
  const outbound = message.direction === "OUTBOUND";
  const Icon = KIND_ICON[message.kind as keyof typeof KIND_ICON];
  const href = openableMediaUrl(message.mediaUrl);
  const author = outbound ? message.author?.name ?? message.author?.email : null;

  const failed = message.status === "FAILED";

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "min-w-0 max-w-[85%] overflow-hidden rounded-[14px] px-[12px] py-[8px] text-[13px] sm:max-w-[72%]",
          outbound
            ? cn("rounded-br-[4px] text-white", failed ? "bg-[#7f1d1d]" : "kv-gradient")
            : "rounded-bl-[4px] border-[0.8px] border-kv-border bg-kv-card text-kv-fg shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
        )}
      >
        {author ? (
          <p className="mb-[2px] text-[11px] font-medium text-white/60">{author}</p>
        ) : null}

        {Icon ? (
          <div
            className={cn(
              "mb-[6px] flex items-center gap-[8px] rounded-[8px] px-[8px] py-[6px] text-[12px]",
              outbound ? "bg-white/10" : "bg-kv-secondary"
            )}
          >
            <Icon className="h-[14px] w-[14px] shrink-0" />
            <span className="truncate">{message.mediaFilename || attachmentLabel(message.kind)}</span>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="ml-auto shrink-0 font-medium underline underline-offset-2">
                Buka
              </a>
            ) : null}
          </div>
        ) : null}

        {message.body ? (
          <p className="whitespace-pre-wrap break-words leading-[1.5] [overflow-wrap:anywhere]">{message.body}</p>
        ) : null}

        <div
          className={cn(
            "mt-[4px] flex items-center justify-end gap-[4px] text-[10px]",
            outbound ? "text-white/60" : "text-kv-subtle"
          )}
        >
          {timestamp}
          {outbound ? (
            <span className="inline-flex items-center gap-[3px]" title={STATUS_TEXT[message.status]}>
              {failed ? (
                <AlertTriangle className="h-[11px] w-[11px] text-red-200" />
              ) : message.status === "QUEUED" ? (
                <Clock3 className="h-[11px] w-[11px]" />
              ) : (
                <CheckCircle2 className="h-[11px] w-[11px]" />
              )}
              {failed || message.status === "QUEUED" ? STATUS_TEXT[message.status] : null}
            </span>
          ) : null}
        </div>

        {failed && message.errorMessage ? (
          // Without this the operator only saw "failed" and had no idea the
          // provider was switched off or rejecting.
          <p className="mt-[6px] border-l-2 border-white/60 pl-[8px] text-[11px] font-medium leading-[1.4] text-red-50">
            {message.errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
