const BRIDGE_MESSAGE = "buildery:custom-html-height";

export const CUSTOM_HTML_MAX_BYTES = 1_000_000;
export const CUSTOM_HTML_MIN_HEIGHT = 100;
export const CUSTOM_HTML_MAX_HEIGHT = 4000;

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeCustomHtmlBaseUrl(value: string) {
  const input = value.trim();
  if (!input) return "";

  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function insertAfterOpeningTag(html: string, tag: "html" | "head", value: string) {
  const openingTag = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "i");
  return html.replace(openingTag, (match) => `${match}${value}`);
}

/**
 * Turns either a complete HTML document or an HTML fragment into iframe srcDoc.
 * The bridge only reports content height; imported code remains in an opaque
 * sandbox and cannot access the parent page or its authenticated storage.
 */
export function buildCustomHtmlDocument({
  html,
  baseUrl,
  bridgeId,
}: {
  html: string;
  baseUrl?: string;
  bridgeId: string;
}) {
  const normalizedBaseUrl = normalizeCustomHtmlBaseUrl(baseUrl ?? "");
  const base = normalizedBaseUrl
    ? `<base href="${escapeAttribute(normalizedBaseUrl)}">`
    : "";
  const bridge = `<script>(function(){var id=${JSON.stringify(bridgeId)};var send=function(){var d=document.documentElement,b=document.body,h=Math.max(d?d.scrollHeight:0,d?d.offsetHeight:0,b?b.scrollHeight:0,b?b.offsetHeight:0);parent.postMessage({type:${JSON.stringify(BRIDGE_MESSAGE)},id:id,height:h},'*')};if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',send)}else{send()}window.addEventListener('load',send);window.addEventListener('resize',send);if(typeof ResizeObserver!=='undefined'){var ro=new ResizeObserver(send);if(document.documentElement)ro.observe(document.documentElement);if(document.body)ro.observe(document.body)}setTimeout(send,0);setTimeout(send,250);setTimeout(send,1000)})();</script>`;

  let documentHtml = html.trim();
  const headPayload = `${base}${bridge}`;

  if (!/<html(?:\s|>)/i.test(documentHtml)) {
    documentHtml = `<!doctype html><html><head>${headPayload}</head><body>${documentHtml}</body></html>`;
    return documentHtml;
  }

  return /<head(?:\s|>)/i.test(documentHtml)
    ? insertAfterOpeningTag(documentHtml, "head", headPayload)
    : insertAfterOpeningTag(documentHtml, "html", `<head>${headPayload}</head>`);
}

export function isCustomHtmlHeightMessage(
  value: unknown
): value is { type: typeof BRIDGE_MESSAGE; id: string; height: number } {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === BRIDGE_MESSAGE &&
    typeof message.id === "string" &&
    typeof message.height === "number" &&
    Number.isFinite(message.height)
  );
}
