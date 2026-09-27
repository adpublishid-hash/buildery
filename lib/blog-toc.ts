import { blogBodyToHtml } from "@/lib/rich-text";

export type TocHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'");
}

function slugify(text: string) {
  const base = decodeEntities(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return base || "section";
}

/**
 * Renders blog body HTML and, in the same pass, assigns stable `id`
 * attributes to every h2/h3 so the table of contents can link to them.
 */
export function renderPostBody(body: string): {
  html: string;
  headings: TocHeading[];
} {
  const html = blogBodyToHtml(body);
  const headings: TocHeading[] = [];
  const used = new Set<string>();

  const withIds = html.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (match, levelRaw: string, attrs: string, inner: string) => {
      const level = Number(levelRaw) as 2 | 3;
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
      if (!text) return match;

      let id = slugify(text);
      if (used.has(id)) {
        let suffix = 2;
        while (used.has(`${id}-${suffix}`)) suffix += 1;
        id = `${id}-${suffix}`;
      }
      used.add(id);
      headings.push({ id, text, level });

      if (/\sid=/i.test(attrs)) {
        return `<h${level}${attrs}>${inner}</h${level}>`;
      }
      return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
    }
  );

  return { html: withIds, headings };
}
