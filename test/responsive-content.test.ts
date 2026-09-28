import { describe, expect, it } from "vitest";

import { defaultBlockData, newBlockId } from "@/lib/blocks/registry";
import {
  applyContentEdit,
  clearContentOverride,
  contentVariants,
  deviceOverrides,
  humanizeField,
  RESPONSIVE_CONTENT_FIELDS,
  resolveBlockDataForDevice,
} from "@/lib/blocks/responsive-content";
import { blockDataSchemas, parseBlockData, type Block, type BlockType, type HeroData } from "@/lib/blocks/schema";

const hero = (patch: Partial<HeroData> = {}) =>
  ({ ...(defaultBlockData("HERO") as HeroData), ...patch }) as HeroData;

describe("responsive content — field list", () => {
  it("only names fields that exist and are layout choices (enum, number, boolean)", () => {
    for (const [type, fields] of Object.entries(RESPONSIVE_CONTENT_FIELDS)) {
      const shape = (blockDataSchemas[type as BlockType] as unknown as { shape: Record<string, unknown> }).shape;
      const defaults = defaultBlockData(type as BlockType) as Record<string, unknown>;
      for (const field of fields ?? []) {
        expect(shape[field], `${type}.${field}`).toBeDefined();
        expect(["string", "number", "boolean"], `${type}.${field}`).toContain(typeof defaults[field]);
      }
    }
  });

  it("leaves out blocks that cannot be rendered twice safely", () => {
    for (const type of ["CONTACT_FORM", "NEWSLETTER", "FORM_EMBED", "VIDEO", "MAP", "CUSTOM_HTML", "FAQ", "HEADER", "FOOTER", "WHATSAPP_FLOAT"]) {
      expect(RESPONSIVE_CONTENT_FIELDS[type as BlockType], type).toBeUndefined();
    }
  });
});

describe("responsive content — resolving", () => {
  it("parses older blocks without overrides", () => {
    expect(parseBlockData("HERO", { heading: "Hi" }).responsive).toEqual({ tablet: {}, mobile: {} });
  });

  it("cascades desktop → tablet → mobile", () => {
    const data = hero({ layout: "split", align: "left", responsive: { tablet: { layout: "card" }, mobile: { align: "center" } } });
    expect(resolveBlockDataForDevice("HERO", data, "desktop")).toMatchObject({ layout: "split", align: "left" });
    expect(resolveBlockDataForDevice("HERO", data, "tablet")).toMatchObject({ layout: "card", align: "left" });
    expect(resolveBlockDataForDevice("HERO", data, "mobile")).toMatchObject({ layout: "card", align: "center" });
  });

  it("ignores fields that are not allowed or values the schema rejects", () => {
    const data = hero({ heading: "Shared", responsive: { tablet: { heading: "Other", layout: "nope", height: "full" }, mobile: {} } });
    expect(deviceOverrides("HERO", data, "tablet")).toEqual({ height: "full" });
    expect(resolveBlockDataForDevice("HERO", data, "tablet").heading).toBe("Shared");
  });
});

describe("responsive content — editing", () => {
  it("routes layout edits to the device and text edits to every device", () => {
    const data = hero({ layout: "split", heading: "Old" });
    const shown = resolveBlockDataForDevice("HERO", data, "mobile");
    const next = applyContentEdit("HERO", data, "mobile", { ...shown, layout: "centered", heading: "New" });
    expect(next.layout).toBe("split");
    expect(next.heading).toBe("New");
    expect(next.responsive.mobile).toEqual({ layout: "centered" });
    expect(resolveBlockDataForDevice("HERO", next, "mobile").layout).toBe("centered");
    expect(resolveBlockDataForDevice("HERO", next, "tablet").layout).toBe("split");
  });

  it("drops an override that equals what the device would inherit", () => {
    const data = hero({ layout: "split", responsive: { tablet: { layout: "card" }, mobile: {} } });
    const back = applyContentEdit("HERO", data, "tablet", { ...resolveBlockDataForDevice("HERO", data, "tablet"), layout: "split" });
    expect(back.responsive.tablet).toEqual({});
  });

  it("leaves data untouched on desktop", () => {
    const data = hero();
    const next = { ...data, layout: "card" as const };
    expect(applyContentEdit("HERO", data, "desktop", next)).toBe(next);
  });

  it("clears one override or all of them", () => {
    const data = hero({ responsive: { tablet: {}, mobile: { layout: "card", align: "left" } } });
    expect(clearContentOverride(data, "mobile", "layout").responsive.mobile).toEqual({ align: "left" });
    expect(clearContentOverride(data, "mobile").responsive.mobile).toEqual({});
  });
});

describe("responsive content — public variants", () => {
  it("renders a block once when nothing differs", () => {
    expect(contentVariants("HERO", hero())).toHaveLength(1);
  });

  it("groups devices that resolve to the same data", () => {
    const variants = contentVariants("HERO", hero({ responsive: { tablet: {}, mobile: { layout: "card" } } }));
    expect(variants.map((variant) => variant.devices)).toEqual([["desktop", "tablet"], ["mobile"]]);
  });

  it("renders each version with only its own device visible", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { BlockRenderer } = await import("@/components/blocks/block-renderer");
    const block = {
      id: newBlockId(),
      type: "COMPARISON_TABLE",
      data: {
        ...defaultBlockData("COMPARISON_TABLE"),
        layout: "table",
        responsive: { tablet: {}, mobile: { layout: "cards" } },
      },
    } as Block;

    const html = renderToStaticMarkup(createElement(BlockRenderer, { block }));
    expect(html).toContain('class="bd-variant bd-variant-on-desktop bd-variant-on-tablet"');
    expect(html).toContain('class="bd-variant bd-variant-on-mobile"');
    expect(html.match(/<table/g)).toHaveLength(1);

    // The builder shows only the previewed device's version.
    const editor = renderToStaticMarkup(createElement(BlockRenderer, { block, editor: true, previewDevice: "mobile" }));
    expect(editor).not.toContain("bd-variant");
    expect(editor).not.toContain("<table");
  });

  it("labels fields for the override list", () => {
    expect(humanizeField("mediaPosition")).toBe("Media position");
  });
});
