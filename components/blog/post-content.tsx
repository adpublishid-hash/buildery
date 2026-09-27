import { sanitizeRichHtml } from "@/lib/rich-html";

export function PostContent({ html }: { html: string }) {
  return (
    <div
      className="blog-post-content mt-8 text-[17px] leading-8 text-zinc-700"
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
    />
  );
}
