const DANGEROUS_TAGS =
  /<\s*\/?\s*(script|iframe|object|embed|applet|base|meta)\b[^>]*>/gi;
const SCRIPT_BLOCKS = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const DANGEROUS_ATTRS =
  /\s(on\w+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_QUOTED_URL_ATTRS =
  /\s(href|src|xlink:href|formaction)\s*=\s*(["'])\s*(?:javascript:|data:text\/html)[\s\S]*?\2/gi;
const DANGEROUS_UNQUOTED_URL_ATTRS =
  /\s(href|src|xlink:href|formaction)\s*=\s*(?:javascript:|data:text\/html)[^\s>]*/gi;
const META_REFRESH =
  /<meta\b(?=[^>]*http-equiv\s*=\s*(?:"refresh"|'refresh'|refresh))[^>]*>/gi;

export function sanitizeImportedHtml(html: string) {
  return html
    .replace(SCRIPT_BLOCKS, "")
    .replace(META_REFRESH, "")
    .replace(DANGEROUS_TAGS, "")
    .replace(DANGEROUS_ATTRS, "")
    .replace(DANGEROUS_QUOTED_URL_ATTRS, (_match, attr) => ` ${attr}="#"`)
    .replace(DANGEROUS_UNQUOTED_URL_ATTRS, (_match, attr) => ` ${attr}="#"`);
}

export function buildIsolatedHtmlDocument(
  html: string,
  options: { baseUrl?: string } = {}
) {
  const clean = sanitizeImportedHtml(html).trim();
  const baseHref = safeBaseHref(options.baseUrl);
  const baseTag = `<base${baseHref ? ` href="${escapeAttribute(baseHref)}"` : ""} target="_blank">`;
  const shellCss = `
    html { box-sizing: border-box; }
    *, *::before, *::after { box-sizing: inherit; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18181b; background: #fff; }
    img, video, canvas, svg { max-width: 100%; height: auto; }
    a { color: inherit; }
  `;

  if (/<html[\s>]/i.test(clean)) {
    return injectIntoHtmlDocument(clean, shellCss, baseTag);
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${baseTag}
  <style>${shellCss}</style>
</head>
<body>${clean}</body>
</html>`;
}

function injectIntoHtmlDocument(html: string, css: string, baseTag: string) {
  const headPayload = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${baseTag}<style>${css}</style>`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${headPayload}`);
  }
  return html.replace(/<html([^>]*)>/i, `<html$1><head>${headPayload}</head>`);
}

function safeBaseHref(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return "";
  }
  return "";
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
