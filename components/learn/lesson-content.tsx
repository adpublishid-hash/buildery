import Link from "next/link";
import type { LessonType } from "@prisma/client";
import { ExternalLink, FileText } from "lucide-react";

import {
  normalizeEmbedUrl,
  parseLessonContent,
} from "@/lib/lms";
import { blogBodyToHtml, cleanRichTextHtml, isHtmlContent } from "@/lib/rich-text";
import { LessonVideo } from "@/components/learn/lesson-video";

type Props = {
  type: LessonType;
  rawContent: unknown;
  enrollmentId?: string;
  asset?: { id: string; name: string; kind: string } | null;
  transcript?: string | null;
  attachmentLabel?: string | null;
  lessonId?: string;
};

export function LessonContent({ type, rawContent, enrollmentId, asset, transcript, attachmentLabel, lessonId }: Props) {
  const content = parseLessonContent(type, rawContent);
  const privateUrl = asset && enrollmentId
    ? `/api/learn/assets/${asset.id}?enrollment=${encodeURIComponent(enrollmentId)}`
    : null;

  if (type === "TEXT") {
    const body = "body" in content ? content.body : "";
    if (!body.trim()) {
      return (
        <p className="text-sm italic text-zinc-400">
          The instructor hasn&apos;t written this lesson yet.
        </p>
      );
    }
    const html = cleanRichTextHtml(isHtmlContent(body) ? body : blogBodyToHtml(body));
    return <div className="blog-content max-w-3xl rounded-xl border border-zinc-100 bg-zinc-50 px-5 py-4 text-[15px] leading-8 text-zinc-700" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (type === "VIDEO_EMBED") {
    const url = privateUrl || ("url" in content ? content.url : "");
    if (!url) {
      return (
        <p className="text-sm italic text-zinc-400">No video URL set.</p>
      );
    }
    if (privateUrl && enrollmentId && lessonId) return <div className="space-y-3"><LessonVideo src={privateUrl} enrollmentId={enrollmentId} lessonId={lessonId} />{transcript ? <Transcript body={transcript} /> : null}</div>;
    const embed = trustedEmbedUrl(url);
    if (!embed) return <ExternalResource url={url} label="Open lesson video" />;
    return (
      <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-sm">
        <iframe
          src={embed}
          title="Lesson video"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      {transcript ? <Transcript body={transcript} /> : null}
      </div>
    );
  }

  if (type === "PDF") {
    const url = privateUrl || ("url" in content ? content.url : "");
    if (!url) {
      return <p className="text-sm italic text-zinc-400">No PDF URL set.</p>;
    }
    return (
      <div className="space-y-3">
        <object
          data={url}
          type="application/pdf"
          className="h-[72vh] w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
        >
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-zinc-500">
            <FileText className="h-6 w-6 text-zinc-400" />
            Your browser can&apos;t preview this PDF.
          </div>
        </object>
        <Link
          href={url}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {attachmentLabel || asset?.name || "Open PDF in a new tab"}
        </Link>
      </div>
    );
  }

  if (type === "LINK") {
    const url = "url" in content ? content.url : "";
    const label =
      "label" in content && content.label ? content.label : "Open link";
    if (!url) {
      return <p className="text-sm italic text-zinc-400">No link set.</p>;
    }
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-900">External resource</p>
        <p className="mt-1 text-xs text-zinc-500">
          This lesson opens in a new tab.
        </p>
        <Link
          href={url}
          target="_blank"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <ExternalLink className="h-4 w-4" />
          {label}
        </Link>
      </div>
    );
  }

  return null;
}

function trustedEmbedUrl(url: string) {
  const normalized = normalizeEmbedUrl(url);
  try {
    const host = new URL(normalized).hostname.replace(/^www\./, "");
    return ["youtube.com", "youtube-nocookie.com", "player.vimeo.com"].includes(host) ? normalized : "";
  } catch {
    return "";
  }
}

function Transcript({ body }: { body: string }) {
  return <details className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Transcript</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-600">{body}</p></details>;
}

function ExternalResource({ url, label }: { url: string; label: string }) {
  return <Link href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"><ExternalLink className="h-4 w-4" />{label}</Link>;
}
