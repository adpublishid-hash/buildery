import { blockTypes, parseBlockData, type Block, type BlockType } from "@/lib/blocks/schema";

/**
 * Helpers behind the builder's Structure panel: a readable outline of each
 * block, and the page's JSON export/import. Pure, so they can be tested.
 */

export const PAGE_JSON_VERSION = 1;
export const MAX_PAGE_BLOCKS = 60;

const TEXT_KEYS = ["heading", "title", "headline", "name", "label", "question", "text", "caption", "brand", "logoText"];

function firstText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of TEXT_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string") {
      const text = stripHtml(candidate).trim();
      if (text) return text;
    }
  }
  return null;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function truncate(value: string, max = 48) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** What a block says about itself: its heading or title, if it has one. */
export function blockSummary(block: Block): string | null {
  const text = firstText(block.data);
  return text ? truncate(text) : null;
}

const GROUP_LABELS: Record<string, string> = {
  items: "Item",
  navItems: "Navigasi",
  socialItems: "Sosial media",
  features: "Fitur",
  plans: "Paket",
  slides: "Slide",
  images: "Gambar",
  logos: "Logo",
  tabs: "Tab",
  excludedFeatures: "Tidak termasuk",
  benefits: "Manfaat",
  columns: "Kolom",
  stats: "Statistik",
  rows: "Baris",
  options: "Opsi",
  fields: "Field",
  values: "Nilai",
};

export type OutlineGroup = { key: string; label: string; items: string[] };

/**
 * The lists inside a block (FAQ questions, buttons, pricing plans…), each
 * item named by its own text. This is what the panel shows as children.
 */
export function blockOutline(block: Block): OutlineGroup[] {
  const groups: OutlineGroup[] = [];
  for (const [key, value] of Object.entries(block.data as Record<string, unknown>)) {
    if (key === "style" || key === "animation" || !Array.isArray(value) || value.length === 0) continue;
    const label = GROUP_LABELS[key] ?? key;
    const items = value.map((item, index) => {
      if (typeof item === "string") return truncate(stripHtml(item).trim() || `${label} ${index + 1}`);
      return truncate(firstText(item) ?? `${label} ${index + 1}`);
    });
    groups.push({ key, label, items });
  }
  return groups;
}

/** Downloadable snapshot of a page's blocks. Ids are left out on purpose. */
export function exportPageJson(title: string, blocks: Block[]) {
  return JSON.stringify(
    {
      version: PAGE_JSON_VERSION,
      page: title,
      exportedAt: new Date().toISOString(),
      blocks: blocks.map((block) => ({ type: block.type, data: block.data })),
    },
    null,
    2
  );
}

export type ParsedPageJson =
  | { ok: true; blocks: { type: BlockType; data: Block["data"] }[]; skipped: number }
  | { ok: false; error: string };

/**
 * Reads a file made by `exportPageJson` (or a bare array of blocks).
 *
 * Unknown block types are skipped and counted; each known block goes through
 * the same per-field repair as stored data. A header or footer never arrives
 * as the site-wide one: saving it would overwrite the header every other page
 * shares, from a file that may come from another site.
 */
export function parsePageJson(text: string): ParsedPageJson {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "File bukan JSON yang valid." };
  }

  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { blocks?: unknown }).blocks)
      ? (raw as { blocks: unknown[] }).blocks
      : null;
  if (!list) return { ok: false, error: "Tidak ada daftar blok di file ini." };

  const known = new Set<string>(blockTypes);
  const blocks: { type: BlockType; data: Block["data"] }[] = [];
  let skipped = 0;
  for (const entry of list) {
    const type = entry && typeof entry === "object" ? (entry as { type?: unknown }).type : null;
    if (typeof type !== "string" || !known.has(type)) {
      skipped++;
      continue;
    }
    const data = parseBlockData(type as BlockType, (entry as { data?: unknown }).data) as Block["data"];
    if ("siteWide" in (data as object)) (data as { siteWide?: boolean }).siteWide = false;
    blocks.push({ type: type as BlockType, data });
  }

  if (blocks.length === 0) return { ok: false, error: "File tidak berisi blok yang dikenali." };
  if (blocks.length > MAX_PAGE_BLOCKS) {
    return { ok: false, error: `Maksimal ${MAX_PAGE_BLOCKS} blok per halaman; file ini berisi ${blocks.length}.` };
  }
  return { ok: true, blocks, skipped };
}

/**
 * Inserts `added` right after the block `afterId`, or at the end when there
 * is no such block. New blocks land next to what the user is working on
 * instead of at the bottom of a long page.
 */
export function insertBlocksAfter(blocks: Block[], afterId: string | null, added: Block[]): Block[] {
  const index = afterId ? blocks.findIndex((block) => block.id === afterId) : -1;
  if (index === -1) return [...blocks, ...added];
  return [...blocks.slice(0, index + 1), ...added, ...blocks.slice(index + 1)];
}
