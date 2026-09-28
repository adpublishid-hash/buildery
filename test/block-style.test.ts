import { describe, expect, it } from "vitest";

import { defaultBlockData, newBlockId } from "@/lib/blocks/registry";
import { blockStyleSchema, parseBlockDataWithReport, type Block } from "@/lib/blocks/schema";
import {
  blockStyleCss,
  blockWrapperProps,
  deviceDeclarations,
  hasCustomStyle,
  isBlockHidden,
  parseStyleClipboard,
  resolveDeviceStyle,
  resolveSpacing,
  resolveStyleValue,
  safeCssUrl,
  sanitizeAnchorId,
  sanitizeClassNames,
  sanitizeCssColor,
  slugifyAnchorId,
  STYLE_PRESETS,
} from "@/lib/blocks/style";
import { copyBlockData, parseClipboardBlock } from "@/lib/builder/clipboard";
import { insertBlocksAfter } from "@/lib/builder/structure";

const style = (input: Record<string, unknown>) => blockStyleSchema.parse(input);
type Device = "desktop" | "tablet" | "mobile";
const decl = (input: Record<string, unknown>, device: Device = "desktop") =>
  deviceDeclarations(style(input), device);
const vars = (input: Record<string, unknown>, device: Device = "desktop") =>
  decl(input, device).self as Record<string, string | undefined>;

function textBlock(patch: Record<string, unknown> = {}): Block {
  const data = defaultBlockData("TEXT") as Block["data"];
  return {
    id: newBlockId(),
    type: "TEXT",
    data: { ...data, style: { ...data.style, ...patch } },
  } as Block;
}

describe("block style — backwards compatibility", () => {
  it("parses a style stored before the new fields existed", () => {
    const parsed = blockStyleSchema.parse({ paddingY: "lg", border: "sm", shadow: "md" });
    expect(parsed).toMatchObject({
      paddingY: "lg",
      hidden: false,
      backgroundType: "color",
      opacity: 100,
      anchorId: "",
    });
  });

  it("renders the old presets exactly as before", () => {
    const css = vars({ paddingY: "lg", paddingX: "sm", marginY: "md", border: "sm", shadow: "sm" });
    expect(css["--bd-block-padding-top"]).toBe("72px");
    expect(css["--bd-block-padding-bottom"]).toBe("72px");
    expect(css["--bd-block-padding-left"]).toBe("16px");
    expect(css["--bd-block-margin-top"]).toBe("32px");
    expect(css["--bd-block-border"]).toBe("1px solid #e4e4e7");
    expect(css["--bd-block-shadow"]).toBe("0 1px 2px 0 rgb(0 0 0 / 0.05)");
  });

  it("emits nothing for a default style", () => {
    const props = blockWrapperProps(style({}), "blk_1");
    expect(props.className).toEqual(["bd-s-blk_1"]);
    expect(props.id).toBeUndefined();
    expect(props.css).toBe("");
  });

  it("repairs only the over-long new field, keeping the rest of the block", () => {
    const data = defaultBlockData("TEXT") as { style: Record<string, unknown> };
    const report = parseBlockDataWithReport("TEXT", {
      ...data,
      heading: "Keep me",
      style: { ...data.style, anchorId: "x".repeat(200), paddingYValue: 40 },
    });
    expect(report.data.heading).toBe("Keep me");
    expect(report.data.style.paddingYValue).toBe(40);
    // Too-long text is cut to the limit, not thrown away.
    expect(report.data.style.anchorId).toHaveLength(64);
  });
});

describe("block style — spacing", () => {
  it("lets a per-side value win over its axis value", () => {
    const css = vars({ paddingYValue: 40, paddingTopValue: 120 });
    expect(css["--bd-block-padding-top"]).toBe("120px");
    expect(css["--bd-block-padding-bottom"]).toBe("40px");
  });

  it("allows negative margins for overlapping sections", () => {
    expect(vars({ marginTopValue: -80 })["--bd-block-margin-top"]).toBe("-80px");
  });

  it("resolves a device through the larger breakpoints", () => {
    const value = style({
      paddingYValue: 96,
      paddingXValue: 32,
      tablet: { paddingYValue: 64 },
      mobile: { paddingTopValue: 24 },
    });
    expect(resolveSpacing(value, "desktop")).toMatchObject({ paddingTop: 96, paddingLeft: 32 });
    expect(resolveSpacing(value, "tablet")).toMatchObject({ paddingTop: 64, paddingBottom: 64, paddingLeft: 32 });
    expect(resolveSpacing(value, "mobile")).toMatchObject({ paddingTop: 24, paddingBottom: 64, paddingLeft: 32 });
  });

  it("does not let desktop per-side values shadow a tablet axis override", () => {
    const value = style({ paddingTopValue: 120, tablet: { paddingYValue: 20 } });
    expect(resolveSpacing(value, "tablet").paddingTop).toBe(20);
    expect(deviceDeclarations(value, "tablet").self["--bd-block-padding-top"]).toBe("20px");
  });

  it("reads other values with breakpoint fallback", () => {
    const value = style({ textAlign: "left", mobile: { textAlign: "center" } });
    expect(resolveStyleValue(value, "tablet", "textAlign")).toBe("left");
    expect(resolveStyleValue(value, "mobile", "textAlign")).toBe("center");
  });
});

describe("block style — layout", () => {
  it("turns the wrapper into a flex column only when a min height is set", () => {
    expect(vars({})["--bd-block-display"]).toBeUndefined();
    const css = vars({ minHeightValue: 100, minHeightUnit: "vh", verticalAlign: "center" });
    expect(css["--bd-block-min-height"]).toBe("100vh");
    expect(css["--bd-block-display"]).toBe("flex");
    expect(css["--bd-block-justify"]).toBe("center");
  });

  it("lets a smaller device switch the min height off with 0", () => {
    const input = { minHeightValue: 100, minHeightUnit: "vh", mobile: { minHeightValue: 0 } };
    expect(vars(input, "tablet")["--bd-block-min-height"]).toBe("100vh");
    expect(vars(input, "mobile")["--bd-block-min-height"]).toBeUndefined();
    expect(vars(input, "mobile")["--bd-block-display"]).toBeUndefined();
  });

  it("constrains the block root to the content width", () => {
    expect(decl({ maxWidthValue: 960 }).child).toMatchObject({ "max-width": "960px", width: "100%" });
    expect(decl({ maxWidthValue: 960, mobile: { maxWidthValue: 0 } }, "mobile").child).toEqual({});
  });
});

describe("block style — background", () => {
  it("builds a gradient", () => {
    const css = vars({ backgroundType: "gradient", gradientFrom: "#000", gradientTo: "#fff", gradientAngle: 90 });
    expect(css["--bd-block-bg-image"]).toBe("linear-gradient(90deg, #000, #fff)");
  });

  it("puts an overlay tint above a background image", () => {
    const css = vars({
      backgroundType: "image",
      backgroundImage: "/uploads/hero.jpg",
      backgroundSize: "contain",
      overlayColor: "#000000",
      overlayOpacity: 50,
    });
    expect(css["--bd-block-bg-image"]).toBe(
      'linear-gradient(rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.5)), url("/uploads/hero.jpg")'
    );
    expect(css["--bd-block-bg-size"]).toBe("cover, contain");
    expect(css["--bd-block-bg-repeat"]).toBe("no-repeat, no-repeat");
  });

  it("ignores a gradient or image of the wrong type", () => {
    expect(vars({ backgroundType: "color", backgroundImage: "/a.jpg" })["--bd-block-bg-image"]).toBeUndefined();
  });
});

describe("block style — sanitizing", () => {
  it("accepts ordinary colors", () => {
    for (const color of ["#fff", "#18181bcc", "red", "rgb(0 0 0 / 0.5)", "hsl(210, 40%, 50%)", "var(--bd-accent)"]) {
      expect(sanitizeCssColor(color), color).toBe(color);
    }
  });

  it("rejects anything that could break out of the declaration", () => {
    for (const color of [
      "red; position: fixed",
      "red}body{display:none",
      "url(https://evil.test/x.png)",
      'red" onmouseover="alert(1)',
      "expression(alert(1))",
      "rgb(0,0,0",
    ]) {
      expect(sanitizeCssColor(color), color).toBeUndefined();
    }
    expect(vars({ backgroundColor: "red; position: fixed" })["--bd-block-bg"]).toBeUndefined();
  });

  it("only loads same-site paths and http(s) images, escaped", () => {
    expect(safeCssUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeCssUrl("data:image/svg+xml,<svg/>")).toBeUndefined();
    expect(safeCssUrl("//evil.test/x.png")).toBeUndefined();
    expect(safeCssUrl('https://cdn.test/a") b(.png')).toBe('url("https://cdn.test/a%22%29%20b%28.png")');
  });

  it("keeps anchors and classes to safe tokens", () => {
    expect(sanitizeAnchorId("harga")).toBe("harga");
    expect(sanitizeAnchorId("1harga")).toBeUndefined();
    expect(sanitizeAnchorId('a" onclick="x')).toBeUndefined();
    expect(slugifyAnchorId("Paket Harga Spesial!")).toBe("paket-harga-spesial-");
    expect(slugifyAnchorId("123 Promo")).toBe("promo");
    expect(sanitizeClassNames('promo  hero-dark "><script> x:y')).toEqual(["promo", "hero-dark"]);
    const props = blockWrapperProps(style({ anchorId: "harga", className: "promo" }), "blk_1");
    expect(props.id).toBe("harga");
    expect(props.className).toContain("promo");
  });
});

describe("block style — border, type and effects", () => {
  it("draws a border on chosen sides", () => {
    expect(vars({ borderWidthValue: 2, borderStyle: "dashed", borderSides: "y", borderColor: "#111" })).toMatchObject({
      "--bd-block-border": "2px dashed #111",
      "border-width": "2px 0",
    });
  });

  it("lets a width of 0 switch off a legacy border", () => {
    expect(vars({ border: "md", borderWidthValue: 0 })["--bd-block-border"]).toBeUndefined();
  });

  it("scopes the accent color and heading options to the block", () => {
    const result = decl({ accentColor: "#e11d48", headingWeight: "800", headingTransform: "uppercase", lineHeightValue: 1.8 });
    expect(result.self["--bd-accent"]).toBe("#e11d48");
    expect(result.headings).toEqual({ "font-weight": "800", "text-transform": "uppercase" });
    expect(result.text).toEqual({ "line-height": "1.8" });
  });

  it("applies opacity and backdrop blur", () => {
    expect(vars({ opacity: 40, backdropBlur: 12 })).toMatchObject({
      opacity: "0.4",
      "backdrop-filter": "blur(12px)",
    });
  });
});

describe("block style — presets, clipboard and hiding", () => {
  it("only ships presets the schema accepts", () => {
    for (const preset of STYLE_PRESETS) {
      expect(blockStyleSchema.safeParse({ ...preset.patch }).success, preset.id).toBe(true);
    }
  });

  it("never pastes identity fields", () => {
    const pasted = parseStyleClipboard({ anchorId: "harga", hidden: true, backgroundColor: "#000" });
    expect(pasted).toMatchObject({ anchorId: "", hidden: false, backgroundColor: "#000" });
    expect(parseStyleClipboard({ opacity: "loud" })).toBeNull();
    expect(parseStyleClipboard("nope")).toBeNull();
  });

  it("knows when a block is hidden or restyled", () => {
    expect(isBlockHidden(textBlock({ hidden: true }).data)).toBe(true);
    expect(isBlockHidden(textBlock().data)).toBe(false);
    expect(isBlockHidden(undefined)).toBe(false);
    expect(hasCustomStyle(textBlock().data.style)).toBe(false);
    expect(hasCustomStyle(textBlock({ paddingYValue: 10 }).data.style)).toBe(true);
  });

  it("validates pasted blocks and detaches pasted site chrome", () => {
    expect(parseClipboardBlock({ type: "NOPE", data: {} })).toBeNull();
    expect(parseClipboardBlock(null)).toBeNull();
    const header = parseClipboardBlock({ type: "HEADER", data: { siteWide: true } });
    expect(header?.type).toBe("HEADER");
    expect((header?.data as { siteWide?: boolean }).siteWide).toBe(false);
  });

  it("drops an anchor id that is already taken on the page", () => {
    const original = textBlock({ anchorId: "harga" });
    const duplicate = copyBlockData(original.data, [original]);
    expect(duplicate.style.anchorId).toBe("");
    const elsewhere = copyBlockData(original.data, [textBlock()]);
    expect(elsewhere.style.anchorId).toBe("harga");
    // Deep copy: editing the copy never touches the original.
    elsewhere.style.paddingYValue = 5;
    expect(original.data.style.paddingYValue).toBeUndefined();
  });
});

describe("inserting blocks", () => {
  const [a, b, c] = [textBlock(), textBlock(), textBlock()];
  const added = textBlock();

  it("inserts right after the given block", () => {
    expect(insertBlocksAfter([a, b, c], a.id, [added]).map((block) => block.id)).toEqual([a.id, added.id, b.id, c.id]);
  });

  it("appends when there is no anchor block", () => {
    expect(insertBlocksAfter([a, b], null, [added]).at(-1)?.id).toBe(added.id);
    expect(insertBlocksAfter([a, b], "missing", [added]).at(-1)?.id).toBe(added.id);
  });
});

describe("public rendering", () => {
  it("omits hidden blocks and keeps the default footer when the footer is hidden", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PublicBlockRenderer } = await import("@/components/blocks/public-block-renderer");

    const footerData = defaultBlockData("FOOTER") as Block["data"];
    const blocks = [
      textBlock({ anchorId: "harga", backgroundColor: "red; position: fixed" }),
      { ...textBlock({ hidden: true }), data: { ...textBlock().data, heading: "Secret draft", style: { ...textBlock().data.style, hidden: true } } } as Block,
      { id: newBlockId(), type: "FOOTER", data: { ...footerData, style: { ...footerData.style, hidden: true } } } as Block,
    ];
    const html = renderToStaticMarkup(
      createElement(PublicBlockRenderer, { blocks, workspaceName: "Toko" })
    );

    expect(html).toContain('id="harga"');
    expect(html).not.toContain("Secret draft");
    expect(html).not.toContain("position: fixed");
    expect(html).not.toContain("red;");
    expect(html).not.toContain('data-bd-block="footer"');
    expect(html).toContain("data-bd-default-footer");
  });
});

describe("publish audit with hidden blocks", () => {
  it("treats a page whose blocks are all hidden as empty", async () => {
    const { auditBuilderPage } = await import("@/lib/builder-audit");
    const settings = { title: "A useful landing page title", seoTitle: "", metaDescription: "A".repeat(100), ogImage: "https://example.com/og.jpg" };
    const allHidden = auditBuilderPage(settings, [textBlock({ hidden: true })]);
    expect(allHidden).toContainEqual(expect.objectContaining({ id: "empty-page", level: "error" }));
    const oneVisible = auditBuilderPage(settings, [textBlock({ hidden: true }), textBlock()]);
    expect(oneVisible.some((issue) => issue.id === "empty-page")).toBe(false);
  });
});

describe("block style — every field can differ per device", () => {
  const responsive = style({
    backgroundType: "image",
    backgroundImage: "/hero.jpg",
    headingSizeValue: 56,
    headingWeight: "800",
    borderWidthValue: 2,
    shadow: "xl",
    tablet: { headingSizeValue: 40 },
    mobile: {
      backgroundType: "color",
      backgroundColor: "#111111",
      headingWeight: "default",
      borderWidthValue: 0,
      shadow: "none",
      textAlign: "center",
    },
  });

  it("merges each device over the larger ones", () => {
    expect(resolveDeviceStyle(responsive, "tablet")).toMatchObject({ headingSizeValue: 40, headingWeight: "800", backgroundType: "image" });
    expect(resolveDeviceStyle(responsive, "mobile")).toMatchObject({ headingSizeValue: 40, headingWeight: "default", backgroundType: "color" });
  });

  it("gives each device exactly its own declarations", () => {
    expect(decl(responsive as unknown as Record<string, unknown>, "desktop").self["--bd-block-heading-size"]).toBe("56px");
    expect(decl(responsive as unknown as Record<string, unknown>, "tablet").self["--bd-block-heading-size"]).toBe("40px");
    const mobile = decl(responsive as unknown as Record<string, unknown>, "mobile");
    expect(mobile.self["--bd-block-bg-image"]).toBeUndefined();
    expect(mobile.self["--bd-block-bg"]).toBe("#111111");
    expect(mobile.self["--bd-block-border"]).toBeUndefined();
    expect(mobile.self["--bd-block-shadow"]).toBeUndefined();
    expect(mobile.self["--bd-block-text-align"]).toBe("center");
    // Turning the heading weight back to default on mobile really removes it.
    expect(mobile.headings).toEqual({});
  });

  it("keeps devices in separate, non-overlapping media ranges", () => {
    const css = blockStyleCss(responsive, "bd-s-x");
    expect(css).toContain("@media (min-width:1024px){");
    expect(css).toContain("@media (min-width:640px) and (max-width:1023px){");
    expect(css).toContain("@media (max-width:639px){");
    expect(css.match(/--bd-block-heading-size:56px/g)).toHaveLength(1);
  });

  it("shares one rule when devices end up identical", () => {
    expect(blockStyleCss(style({ paddingYValue: 40 }), "bd-s-x")).toBe(
      ".bd-block-style.bd-s-x{--bd-block-padding-top:40px;--bd-block-padding-bottom:40px}"
    );
    const css = blockStyleCss(style({ paddingYValue: 40, mobile: { paddingYValue: 16 } }), "bd-s-x");
    expect(css).toMatch(/^@media \(min-width:640px\)\{/);
    expect(css).toContain("@media (max-width:639px){");
  });

  it("shows the previewed device in the builder without media queries", () => {
    const css = blockStyleCss(responsive, "bd-s-x", "mobile");
    expect(css).not.toContain("@media");
    expect(css).toContain("--bd-block-bg:#111111");
  });

  it("scopes by block id and never lets markup out of the style element", () => {
    const props = blockWrapperProps(style({ paddingYValue: 8 }), "blk</style><script>");
    expect(props.className[0]).toBe("bd-s-blk__style__script_");
    expect(props.css).not.toContain("<");
  });

  it("treats a cleared device color as not set", () => {
    const value = style({ backgroundColor: "#fff", tablet: { backgroundColor: "" } });
    expect(resolveStyleValue(value, "tablet", "backgroundColor")).toBe("#fff");
    expect(deviceDeclarations(value, "tablet").self["--bd-block-bg"]).toBe("#fff");
  });

  it("does not fill device overrides with defaults", () => {
    expect(style({ tablet: { headingWeight: "700" } }).tablet).toEqual({ headingWeight: "700" });
  });
});
