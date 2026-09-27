import { describe, expect, it } from "vitest";

import { defaultBlockData } from "@/lib/blocks/registry";
import type { Block } from "@/lib/blocks/schema";
import {
  blockOutline,
  blockSummary,
  exportPageJson,
  MAX_PAGE_BLOCKS,
  parsePageJson,
} from "@/lib/builder/structure";
import { pageAdvancedSchema, unwrapStyleTag } from "@/lib/page-advanced";

function block(type: Block["type"], data: Record<string, unknown> = {}): Block {
  return { id: `id-${type}`, type, data: { ...defaultBlockData(type), ...data } } as Block;
}

describe("page JSON export/import", () => {
  it("round-trips blocks without their ids", () => {
    const blocks = [block("HERO", { heading: "Halo" }), block("FAQ")];
    const parsed = parsePageJson(exportPageJson("Beranda", blocks));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.blocks.map((b) => b.type)).toEqual(["HERO", "FAQ"]);
    expect((parsed.blocks[0].data as { heading: string }).heading).toBe("Halo");
    expect(parsed.blocks[0]).not.toHaveProperty("id");
  });

  it("never imports a header or footer as the site-wide one", () => {
    const file = JSON.stringify({ blocks: [{ type: "HEADER", data: { ...defaultBlockData("HEADER"), siteWide: true } }] });
    const parsed = parsePageJson(file);
    expect(parsed.ok && (parsed.blocks[0].data as { siteWide?: boolean }).siteWide).toBe(false);
  });

  it("skips unknown types, accepts a bare array, and refuses junk", () => {
    const parsed = parsePageJson(JSON.stringify([{ type: "NOPE" }, { type: "TEXT", data: {} }]));
    expect(parsed).toMatchObject({ ok: true, skipped: 1 });
    expect(parsePageJson("{not json").ok).toBe(false);
    expect(parsePageJson(JSON.stringify({ page: "x" })).ok).toBe(false);
    expect(parsePageJson(JSON.stringify([{ type: "NOPE" }])).ok).toBe(false);
  });

  it("keeps the page block limit", () => {
    const many = Array.from({ length: MAX_PAGE_BLOCKS + 1 }, () => ({ type: "TEXT", data: {} }));
    expect(parsePageJson(JSON.stringify(many)).ok).toBe(false);
  });
});

describe("structure outline", () => {
  it("names a block by its heading and lists its items", () => {
    const faq = block("FAQ", {
      heading: "<b>Pertanyaan</b> umum",
      items: [{ question: "Bisa COD?", answer: "Bisa" }, { question: "", answer: "" }],
    });
    expect(blockSummary(faq)).toBe("Pertanyaan umum");
    const items = blockOutline(faq).find((group) => group.key === "items");
    expect(items?.items).toEqual(["Bisa COD?", "Item 2"]);
  });
});

describe("page advanced settings", () => {
  it("accepts known events and plain CSS", () => {
    expect(pageAdvancedSchema.safeParse({ pixelEvent: "Lead", customCss: "h1{color:red}" }).success).toBe(true);
    expect(pageAdvancedSchema.safeParse({ pixelEvent: "" }).success).toBe(true);
  });

  it("refuses checkout events, tag break-outs and unknown fields", () => {
    expect(pageAdvancedSchema.safeParse({ pixelEvent: "Purchase" }).success).toBe(false);
    expect(pageAdvancedSchema.safeParse({ customCss: "a{}</style><script>x</script>" }).success).toBe(false);
    expect(pageAdvancedSchema.safeParse({ customCss: "<!-- a{} -->" }).success).toBe(false);
    expect(pageAdvancedSchema.safeParse({ customScript: "alert(1)" }).success).toBe(false);
  });

  it("unwraps a pasted <style> tag", () => {
    expect(unwrapStyleTag("<style>\n.a{}\n</style>")).toBe("\n.a{}\n");
    expect(unwrapStyleTag(".a{}")).toBe(".a{}");
  });
});
