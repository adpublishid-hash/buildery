import type { Block } from "@/lib/blocks/schema";

/**
 * Undo/redo for the page builder.
 *
 * The builder had none: the only way back from a mistake was the server-side
 * revision list, which means losing everything since the last save. Ctrl+Z is
 * the first thing anyone reaches for.
 *
 * Kept as pure functions so the rules — what coalesces, what the cap is, what
 * redo does after a new edit — can be tested without a browser.
 */

export type HistoryEntry = {
  blocks: Block[];
  /** What produced this state, used to decide whether edits coalesce. */
  label: string;
  at: number;
};

export type BuilderHistory = {
  past: HistoryEntry[];
  future: HistoryEntry[];
};

export const EMPTY_HISTORY: BuilderHistory = { past: [], future: [] };

/** Deep enough: block data is plain JSON. */
export const MAX_HISTORY = 60;

/**
 * Consecutive edits to the same field of the same block inside this window
 * become one undo step — otherwise typing a headline costs a keystroke per
 * Ctrl+Z.
 */
export const COALESCE_MS = 700;

export function canUndo(history: BuilderHistory) {
  return history.past.length > 0;
}

export function canRedo(history: BuilderHistory) {
  return history.future.length > 0;
}

/**
 * Records the state being replaced.
 *
 * `label` identifies the kind of edit — pass something stable per field, e.g.
 * `edit:block_1` — so a run of keystrokes collapses into one step.
 */
export function pushHistory(
  history: BuilderHistory,
  previous: Block[],
  label: string,
  now = Date.now()
): BuilderHistory {
  const top = history.past[history.past.length - 1];
  const coalesce =
    top !== undefined &&
    label.startsWith("edit:") &&
    top.label === label &&
    now - top.at < COALESCE_MS;

  // Coalescing keeps the *older* snapshot — that is the state to go back to —
  // and only moves the clock forward.
  const past = coalesce
    ? [...history.past.slice(0, -1), { ...top, at: now }]
    : [...history.past, { blocks: previous, label, at: now }];

  return {
    past: past.slice(-MAX_HISTORY),
    // Any new edit abandons the branch redo would have returned to.
    future: [],
  };
}

export type HistoryStep = {
  history: BuilderHistory;
  blocks: Block[];
} | null;

/** Steps back. Returns null when there is nothing to undo. */
export function undo(
  history: BuilderHistory,
  present: Block[],
  now = Date.now()
): HistoryStep {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;

  return {
    blocks: previous.blocks,
    history: {
      past: history.past.slice(0, -1),
      future: [
        ...history.future,
        { blocks: present, label: previous.label, at: now },
      ].slice(-MAX_HISTORY),
    },
  };
}

/** Steps forward again. Returns null when there is nothing to redo. */
export function redo(
  history: BuilderHistory,
  present: Block[],
  now = Date.now()
): HistoryStep {
  const next = history.future[history.future.length - 1];
  if (!next) return null;

  return {
    blocks: next.blocks,
    history: {
      past: [...history.past, { blocks: present, label: next.label, at: now }].slice(
        -MAX_HISTORY
      ),
      future: history.future.slice(0, -1),
    },
  };
}
