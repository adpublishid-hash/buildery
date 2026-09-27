import { describe, expect, it } from "vitest";

import type { Block } from "@/lib/blocks/schema";
import {
  canRedo,
  canUndo,
  COALESCE_MS,
  EMPTY_HISTORY,
  MAX_HISTORY,
  pushHistory,
  redo,
  undo,
} from "@/lib/builder/history";

const block = (id: string, text = ""): Block =>
  ({ id, type: "TEXT", data: { text } }) as unknown as Block;

const a = [block("1", "a")];
const b = [block("1", "ab")];
const c = [block("1", "abc")];

describe("pushHistory", () => {
  it("records the state being replaced", () => {
    const history = pushHistory(EMPTY_HISTORY, a, "add", 1_000);
    expect(history.past).toHaveLength(1);
    expect(history.past[0].blocks).toBe(a);
  });

  it("collapses a run of keystrokes in the same field into one step", () => {
    let history = pushHistory(EMPTY_HISTORY, a, "edit:1", 1_000);
    history = pushHistory(history, b, "edit:1", 1_100);
    history = pushHistory(history, c, "edit:1", 1_200);

    // One step back, to before the typing started — not one per character.
    expect(history.past).toHaveLength(1);
    expect(history.past[0].blocks).toBe(a);
  });

  it("starts a new step once the shopper pauses", () => {
    let history = pushHistory(EMPTY_HISTORY, a, "edit:1", 1_000);
    history = pushHistory(history, b, "edit:1", 1_000 + COALESCE_MS + 1);
    expect(history.past).toHaveLength(2);
  });

  it("never collapses edits to different blocks", () => {
    let history = pushHistory(EMPTY_HISTORY, a, "edit:1", 1_000);
    history = pushHistory(history, b, "edit:2", 1_050);
    expect(history.past).toHaveLength(2);
  });

  it("never collapses structural changes", () => {
    let history = pushHistory(EMPTY_HISTORY, a, "remove", 1_000);
    history = pushHistory(history, b, "remove", 1_050);
    // Deleting two blocks quickly must be two separate undos.
    expect(history.past).toHaveLength(2);
  });

  it("drops the oldest steps rather than growing without limit", () => {
    let history = EMPTY_HISTORY;
    for (let i = 0; i < MAX_HISTORY + 20; i += 1) {
      history = pushHistory(history, [block(String(i))], `step-${i}`, i * 10_000);
    }
    expect(history.past).toHaveLength(MAX_HISTORY);
    // The most recent steps are the ones kept.
    expect(history.past.at(-1)?.label).toBe(`step-${MAX_HISTORY + 19}`);
  });

  it("abandons the redo branch, because the future no longer follows", () => {
    const stepped = undo(pushHistory(EMPTY_HISTORY, a, "add", 1_000), b, 1_100)!;
    expect(canRedo(stepped.history)).toBe(true);

    const edited = pushHistory(stepped.history, a, "edit:1", 1_200);
    expect(canRedo(edited)).toBe(false);
  });
});

describe("undo and redo", () => {
  it("walks back and forward through the same states", () => {
    const history = pushHistory(EMPTY_HISTORY, a, "edit:1", 1_000);

    const back = undo(history, b, 1_100)!;
    expect(back.blocks).toBe(a);
    expect(canUndo(back.history)).toBe(false);
    expect(canRedo(back.history)).toBe(true);

    const forward = redo(back.history, back.blocks, 1_200)!;
    expect(forward.blocks).toBe(b);
    expect(canRedo(forward.history)).toBe(false);
    expect(canUndo(forward.history)).toBe(true);
  });

  it("returns nothing at either end instead of throwing", () => {
    expect(undo(EMPTY_HISTORY, a)).toBeNull();
    expect(redo(EMPTY_HISTORY, a)).toBeNull();
  });

  it("survives several steps in a row", () => {
    let history = pushHistory(EMPTY_HISTORY, a, "add", 1_000);
    history = pushHistory(history, b, "add", 5_000);

    const first = undo(history, c, 6_000)!;
    expect(first.blocks).toBe(b);
    const second = undo(first.history, first.blocks, 6_100)!;
    expect(second.blocks).toBe(a);
    expect(undo(second.history, second.blocks)).toBeNull();

    const forward = redo(second.history, second.blocks, 6_200)!;
    expect(forward.blocks).toBe(b);
  });
});
