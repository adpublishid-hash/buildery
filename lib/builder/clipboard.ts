import {
  blockTypes,
  parseBlockData,
  type Block,
  type BlockStyle,
  type BlockType,
} from "@/lib/blocks/schema";
import { parseStyleClipboard, STYLE_CLIPBOARD_KEY } from "@/lib/blocks/style";

/**
 * The builder's copy/paste for styles and whole blocks. Stored in
 * localStorage so a block copied on one page can be pasted on another (or in
 * another tab); storage can be blocked, so an in-memory copy backs it up for
 * the current tab. Everything read back is re-validated against the schema —
 * the stored JSON may come from an older version of the app.
 */

export const BLOCK_CLIPBOARD_KEY = "buildery:block-clipboard";

const memory = new Map<string, string>();

function write(key: string, value: unknown) {
  const json = JSON.stringify(value);
  memory.set(key, json);
  try {
    window.localStorage.setItem(key, json);
  } catch {
    // Storage full or blocked: the in-memory copy still works in this tab.
  }
}

function read(key: string): unknown {
  let json: string | null = null;
  try {
    json = window.localStorage.getItem(key);
  } catch {
    json = null;
  }
  json ??= memory.get(key) ?? null;
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function writeStyleClipboard(style: BlockStyle) {
  write(STYLE_CLIPBOARD_KEY, style);
}

export function readStyleClipboard(): BlockStyle | null {
  return parseStyleClipboard(read(STYLE_CLIPBOARD_KEY));
}

export function writeBlockClipboard(block: Pick<Block, "type" | "data">) {
  write(BLOCK_CLIPBOARD_KEY, { type: block.type, data: block.data });
}

export function readBlockClipboard(): Pick<Block, "type" | "data"> | null {
  return parseClipboardBlock(read(BLOCK_CLIPBOARD_KEY));
}

export function parseClipboardBlock(raw: unknown): Pick<Block, "type" | "data"> | null {
  if (!raw || typeof raw !== "object") return null;
  const { type, data } = raw as { type?: unknown; data?: unknown };
  if (typeof type !== "string" || !(blockTypes as readonly string[]).includes(type)) {
    return null;
  }
  const parsed = parseBlockData(type as BlockType, data) as Block["data"] & {
    siteWide?: boolean;
  };
  // A pasted header/footer is this page's own until the user says otherwise.
  if (parsed.siteWide) parsed.siteWide = false;
  return { type: type as BlockType, data: parsed } as Pick<Block, "type" | "data">;
}

/**
 * Deep-copies block data for a duplicate or paste. An anchor id already used
 * on the page is dropped: two elements sharing an id break `#links`.
 */
export function copyBlockData<T extends Block["data"]>(data: T, pageBlocks: Block[]): T {
  const copy = JSON.parse(JSON.stringify(data)) as T;
  const style = (copy as { style?: Partial<BlockStyle> }).style;
  const anchor = style?.anchorId?.trim();
  if (style && anchor) {
    const taken = pageBlocks.some(
      (block) => (block.data as { style?: Partial<BlockStyle> }).style?.anchorId?.trim() === anchor
    );
    if (taken) style.anchorId = "";
  }
  return copy;
}
