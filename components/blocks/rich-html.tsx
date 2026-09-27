import { sanitizeRichHtml } from "@/lib/rich-html";

export function RichHtml({ html }: { html: string }) {
  return (
    <div
      className="bd-rich-text"
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
    />
  );
}
