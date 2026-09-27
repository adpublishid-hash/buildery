export type TemplateAssetUpload = (asset: {
  file: File;
  path: string;
  mimeType: string;
}) => Promise<string | null>;

export type HtmlTemplateImportResult = {
  html: string;
  label: string;
  assetCount: number;
  resolvedAssetCount: number;
  warnings: string[];
};

type ImportEntry = {
  file: File;
  path: string;
  mimeType: string;
};

type TemplateFile = File & {
  _builderyRelativePath?: string;
  webkitRelativePath?: string;
};

type ImportContext = {
  entriesByPath: Map<string, ImportEntry>;
  entriesByLowerPath: Map<string, ImportEntry>;
  entriesByName: Map<string, ImportEntry[]>;
  rootPath: string;
  resolvedUrls: Map<string, string>;
  resolvedAssetPaths: Set<string>;
  warnings: string[];
  uploadAsset?: TemplateAssetUpload;
};

const HTML_FILE_RE = /\.html?$/i;
const CSS_FILE_RE = /\.css$/i;
const MAX_HTML_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_TEMPLATE_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_INLINE_ASSET_BYTES = 1024 * 1024;
const SPECIAL_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const ZIP_FILE_RE = /\.zip$/i;

const MIME_BY_EXTENSION: Record<string, string> = {
  css: "text/css",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  pdf: "application/pdf",
};

export async function importHtmlTemplateBundle(
  files: Iterable<File>,
  options: { uploadAsset?: TemplateAssetUpload } = {}
): Promise<HtmlTemplateImportResult> {
  const templateFiles = await expandTemplateFiles(files);
  const entries = templateFiles.map(toEntry).filter((entry) => entry.path);
  if (entries.length === 0) {
    throw new Error("Tidak ada file template yang dipilih.");
  }

  const totalSize = entries.reduce((sum, entry) => sum + entry.file.size, 0);
  if (totalSize > MAX_TEMPLATE_IMPORT_BYTES) {
    throw new Error("Ukuran folder template maksimal 20 MB.");
  }

  const htmlEntry = pickHtmlEntry(entries);
  if (!htmlEntry) {
    throw new Error("Folder template harus berisi file .html atau .htm.");
  }
  if (htmlEntry.file.size > MAX_HTML_IMPORT_BYTES) {
    throw new Error("File HTML maksimal 2 MB.");
  }

  const ctx = createImportContext(entries, options.uploadAsset);
  let html = await htmlEntry.file.text();
  html = await inlineStylesheetLinks(html, htmlEntry.path, ctx);
  html = await rewriteStyleBlocks(html, htmlEntry.path, ctx);
  html = await rewriteHtmlAssetAttributes(html, htmlEntry.path, ctx);

  return {
    html,
    label: basename(htmlEntry.path).replace(HTML_FILE_RE, "") || "Imported HTML template",
    assetCount: Math.max(0, entries.length - 1),
    resolvedAssetCount: ctx.resolvedAssetPaths.size,
    warnings: ctx.warnings,
  };
}

function toEntry(file: File): ImportEntry {
  const withRelativePath = file as TemplateFile;
  const path = normalizePath(
    withRelativePath._builderyRelativePath ||
      withRelativePath.webkitRelativePath ||
      file.name
  );
  return {
    file,
    path,
    mimeType: file.type || mimeFromPath(path),
  };
}

async function expandTemplateFiles(files: Iterable<File>) {
  const input = Array.from(files);
  if (input.length === 1 && isZipFile(input[0])) {
    return readZipTemplate(input[0]);
  }
  return input;
}

function isZipFile(file: File) {
  return ZIP_FILE_RE.test(file.name) || file.type === "application/zip";
}

async function readZipTemplate(file: File) {
  if (file.size > MAX_TEMPLATE_IMPORT_BYTES) {
    throw new Error("Ukuran ZIP template maksimal 20 MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset === -1) {
    throw new Error("File ZIP template tidak valid.");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);
  const extracted: File[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) {
      throw new Error("Struktur ZIP template tidak valid.");
    }

    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const nameStart = centralOffset + 46;
    const rawName = decodeUtf8(bytes.slice(nameStart, nameStart + fileNameLength));
    const entryPath = normalizePath(rawName);

    centralOffset = nameStart + fileNameLength + extraLength + commentLength;

    if (!entryPath || rawName.endsWith("/") || entryPath.includes("__MACOSX/")) {
      continue;
    }
    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error("Isi ZIP template tidak valid.");
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    const content = await unzipEntry(data, method);
    const extractedFile = new File([toArrayBuffer(content)], basename(entryPath), {
      type: mimeFromPath(entryPath),
    }) as TemplateFile;
    extractedFile._builderyRelativePath = entryPath;
    extracted.push(extractedFile);
  }

  if (extracted.length === 0) {
    throw new Error("ZIP template kosong.");
  }

  return extracted;
}

function findEndOfCentralDirectory(view: DataView) {
  const maxCommentLength = 0xffff;
  const start = Math.max(0, view.byteLength - (maxCommentLength + 22));
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function unzipEntry(data: Uint8Array, method: number) {
  if (method === 0) return data;
  if (method !== 8) {
    throw new Error("ZIP template hanya mendukung file store/deflate.");
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error("Browser belum mendukung ekstraksi ZIP deflate.");
  }

  const stream = new Blob([toArrayBuffer(data)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function createImportContext(
  entries: ImportEntry[],
  uploadAsset?: TemplateAssetUpload
): ImportContext {
  const entriesByPath = new Map<string, ImportEntry>();
  const entriesByLowerPath = new Map<string, ImportEntry>();
  const entriesByName = new Map<string, ImportEntry[]>();

  for (const entry of entries) {
    entriesByPath.set(entry.path, entry);
    entriesByLowerPath.set(entry.path.toLowerCase(), entry);
    const name = basename(entry.path).toLowerCase();
    entriesByName.set(name, [...(entriesByName.get(name) ?? []), entry]);
  }

  return {
    entriesByPath,
    entriesByLowerPath,
    entriesByName,
    rootPath: sharedRootPath(entries.map((entry) => entry.path)),
    resolvedUrls: new Map(),
    resolvedAssetPaths: new Set(),
    warnings: [],
    uploadAsset,
  };
}

function pickHtmlEntry(entries: ImportEntry[]) {
  const htmlEntries = entries
    .filter((entry) => HTML_FILE_RE.test(entry.path))
    .sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path));
  return (
    htmlEntries.find((entry) => basename(entry.path).toLowerCase() === "index.html") ??
    htmlEntries[0] ??
    null
  );
}

async function inlineStylesheetLinks(
  html: string,
  htmlPath: string,
  ctx: ImportContext
) {
  return replaceAsync(html, /<link\b[^>]*>/gi, async (match) => {
    const tag = match[0];
    const rel = readAttribute(tag, "rel").toLowerCase();
    const href = readAttribute(tag, "href");
    if (!rel.split(/\s+/).includes("stylesheet") || !href) return tag;

    const entry = findAssetEntry(href, htmlPath, ctx);
    if (!entry || !CSS_FILE_RE.test(entry.path)) return tag;

    const css = await buildCss(entry, ctx, new Set());
    ctx.resolvedAssetPaths.add(entry.path);
    return `<style data-buildery-imported="${escapeAttribute(href)}">\n${escapeStyleEnd(css)}\n</style>`;
  });
}

async function rewriteStyleBlocks(
  html: string,
  htmlPath: string,
  ctx: ImportContext
) {
  return replaceAsync(html, /<style\b([^>]*)>([\s\S]*?)<\/style>/gi, async (match) => {
    const attrs = match[1] ?? "";
    const css = match[2] ?? "";
    const rewritten = await rewriteCssUrls(css, htmlPath, ctx);
    return `<style${attrs}>${escapeStyleEnd(rewritten)}</style>`;
  });
}

async function rewriteHtmlAssetAttributes(
  html: string,
  htmlPath: string,
  ctx: ImportContext
) {
  let next = await replaceAsync(
    html,
    /\s(src|href|poster|data-src)\s*=\s*(["'])([^"']*)\2/gi,
    async (match) => {
      const attr = match[1];
      const quote = match[2];
      const rawValue = unescapeAttribute(match[3] ?? "");
      const resolved = await resolveAssetUrl(rawValue, htmlPath, ctx);
      if (!resolved) return match[0];
      return ` ${attr}=${quote}${escapeAttribute(resolved)}${quote}`;
    }
  );

  next = await replaceAsync(next, /\s(srcset)\s*=\s*(["'])([^"']*)\2/gi, async (match) => {
    const attr = match[1];
    const quote = match[2];
    const srcset = unescapeAttribute(match[3] ?? "");
    const rewritten = await rewriteSrcset(srcset, htmlPath, ctx);
    return ` ${attr}=${quote}${escapeAttribute(rewritten)}${quote}`;
  });

  return next;
}

async function buildCss(
  entry: ImportEntry,
  ctx: ImportContext,
  seen: Set<string>
): Promise<string> {
  if (seen.has(entry.path)) return "";
  seen.add(entry.path);

  let css = await entry.file.text();
  css = await replaceAsync(
    css,
    /@import\s+(?:url\(\s*)?(["']?)([^"')]+)\1\s*\)?[^;]*;/gi,
    async (match) => {
      const url = match[2] ?? "";
      const imported = findAssetEntry(url, entry.path, ctx);
      if (!imported || !CSS_FILE_RE.test(imported.path)) return match[0];
      ctx.resolvedAssetPaths.add(imported.path);
      return buildCss(imported, ctx, seen);
    }
  );

  return rewriteCssUrls(css, entry.path, ctx);
}

async function rewriteCssUrls(css: string, cssPath: string, ctx: ImportContext) {
  return replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (match) => {
    const quote = match[1] || "";
    const rawUrl = match[2] ?? "";
    const resolved = await resolveAssetUrl(rawUrl, cssPath, ctx);
    if (!resolved) return match[0];
    return `url(${quote}${escapeCssUrl(resolved)}${quote})`;
  });
}

async function rewriteSrcset(srcset: string, basePath: string, ctx: ImportContext) {
  const parts = srcset
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const rewritten = await Promise.all(
    parts.map(async (part) => {
      const [url, ...rest] = part.split(/\s+/);
      const resolved = await resolveAssetUrl(url, basePath, ctx);
      return [resolved || url, ...rest].join(" ");
    })
  );
  return rewritten.join(", ");
}

async function resolveAssetUrl(
  rawUrl: string,
  basePath: string,
  ctx: ImportContext
) {
  const cleanUrl = rawUrl.trim();
  if (!cleanUrl || SPECIAL_URL_RE.test(cleanUrl)) return null;

  const entry = findAssetEntry(cleanUrl, basePath, ctx);
  if (!entry || HTML_FILE_RE.test(entry.path) || CSS_FILE_RE.test(entry.path)) {
    return null;
  }

  const cached = ctx.resolvedUrls.get(entry.path);
  if (cached) return cached;

  let publicUrl: string | null = null;
  if (ctx.uploadAsset) {
    try {
      publicUrl = await ctx.uploadAsset({
        file: entry.file,
        path: entry.path,
        mimeType: entry.mimeType,
      });
    } catch {
      publicUrl = null;
    }
  }

  if (!publicUrl) {
    if (entry.file.size > MAX_INLINE_ASSET_BYTES) {
      ctx.warnings.push(
        `${entry.path} terlalu besar untuk di-inline dan tidak berhasil diupload.`
      );
      return null;
    }
    publicUrl = await fileToDataUrl(entry.file, entry.mimeType);
  }

  ctx.resolvedUrls.set(entry.path, publicUrl);
  ctx.resolvedAssetPaths.add(entry.path);
  return publicUrl;
}

function findAssetEntry(rawUrl: string, basePath: string, ctx: ImportContext) {
  const urlPath = stripQueryAndHash(rawUrl);
  if (!urlPath) return null;
  const decoded = safeDecode(urlPath);
  const candidates = buildPathCandidates(decoded, basePath, ctx.rootPath);

  for (const candidate of candidates) {
    const exact = ctx.entriesByPath.get(candidate);
    if (exact) return exact;
    const lower = ctx.entriesByLowerPath.get(candidate.toLowerCase());
    if (lower) return lower;
  }

  const nameMatches = ctx.entriesByName.get(basename(decoded).toLowerCase());
  return nameMatches?.length === 1 ? nameMatches[0] : null;
}

function buildPathCandidates(rawPath: string, basePath: string, rootPath: string) {
  const cleanPath = rawPath.replace(/\\/g, "/");
  const trimmed = cleanPath.replace(/^\/+/, "");
  const candidates = new Set<string>();

  if (cleanPath.startsWith("/")) {
    candidates.add(normalizePath(joinPath(rootPath, trimmed)));
    candidates.add(normalizePath(trimmed));
  } else {
    candidates.add(normalizePath(joinPath(dirname(basePath), cleanPath)));
    candidates.add(normalizePath(joinPath(rootPath, cleanPath)));
    candidates.add(normalizePath(cleanPath));
  }

  return [...candidates].filter(Boolean);
}

function readAttribute(tag: string, name: string) {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  ).exec(tag);
  return unescapeAttribute(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

async function replaceAsync(
  input: string,
  regex: RegExp,
  replacer: (match: RegExpMatchArray) => Promise<string>
) {
  const matches = Array.from(input.matchAll(regex));
  if (matches.length === 0) return input;

  let output = "";
  let lastIndex = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    output += input.slice(lastIndex, index);
    output += await replacer(match);
    lastIndex = index + match[0].length;
  }
  return output + input.slice(lastIndex);
}

async function fileToDataUrl(file: File, mimeType: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mimeType || "application/octet-stream"};base64,${btoa(binary)}`;
}

function sharedRootPath(paths: string[]) {
  const firstSegments = paths
    .map((path) => path.split("/").filter(Boolean))
    .filter((segments) => segments.length > 1)
    .map((segments) => segments[0]);
  if (firstSegments.length === 0) return "";
  const first = firstSegments[0];
  return firstSegments.every((segment) => segment === first) ? first : "";
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

function joinPath(...parts: string[]) {
  return normalizePath(parts.filter(Boolean).join("/"));
}

function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function basename(path: string) {
  return path.split("/").filter(Boolean).pop() ?? "";
}

function stripQueryAndHash(url: string) {
  const index = url.search(/[?#]/);
  return index === -1 ? url : url.slice(0, index);
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mimeFromPath(path: string) {
  const ext = basename(path).split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeStyleEnd(css: string) {
  return css.replace(/<\/style/gi, "<\\/style");
}

function escapeCssUrl(value: string) {
  return value.replace(/\)/g, "\\)");
}
