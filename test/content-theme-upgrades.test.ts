import { describe, expect, it } from "vitest";

import {
  DEFAULT_DESIGN_TOKENS,
  FONT_CHOICES,
  builderDesignTokenStyle,
  builderDesignTokensSchema,
  parseBuilderDesignTokens,
} from "@/lib/builder-design-tokens";
import { AUTOSAVE_KEEP, CHECKPOINT_KEEP } from "@/lib/page-revisions";

describe("design tokens stay backward compatible", () => {
  it("keeps colours saved before the newer fields existed", () => {
    // Baris lama hanya memuat enam field. Kalau field baru tidak punya
    // default, safeParse gagal dan seluruh tema pemilik situs hilang.
    const legacy = {
      accentColor: "#ff5500",
      backgroundColor: "#fffef7",
      textColor: "#101014",
      headingFont: "serif",
      bodyFont: "system",
      radius: "lg",
    };

    const tokens = parseBuilderDesignTokens(legacy);

    expect(tokens.accentColor).toBe("#ff5500");
    expect(tokens.backgroundColor).toBe("#fffef7");
    expect(tokens.headingFont).toBe("serif");
    expect(tokens.radius).toBe("lg");
    // Field baru mengisi dirinya sendiri.
    expect(tokens.spacing).toBe("normal");
    expect(tokens.containerWidth).toBe("normal");
  });

  it("falls back to the workspace accent when nothing is stored", () => {
    expect(parseBuilderDesignTokens(null, "#123456").accentColor).toBe("#123456");
  });

  it("ignores an accent that is not a hex colour", () => {
    expect(parseBuilderDesignTokens(null, "red").accentColor).toBe(
      DEFAULT_DESIGN_TOKENS.accentColor
    );
  });

  it("rejects a colour that is not six hex digits", () => {
    expect(
      builderDesignTokensSchema.safeParse({
        ...DEFAULT_DESIGN_TOKENS,
        accentColor: "#fff",
      }).success
    ).toBe(false);
  });

  it("accepts every font the picker offers", () => {
    for (const font of FONT_CHOICES) {
      expect(
        builderDesignTokensSchema.safeParse({
          ...DEFAULT_DESIGN_TOKENS,
          headingFont: font,
          bodyFont: font,
        }).success
      ).toBe(true);
    }
  });

  it("emits a CSS variable for every token", () => {
    const style = builderDesignTokenStyle({
      ...DEFAULT_DESIGN_TOKENS,
      spacing: "roomy",
      containerWidth: "wide",
    }) as Record<string, string>;

    expect(style["--bd-accent"]).toBe(DEFAULT_DESIGN_TOKENS.accentColor);
    expect(style["--bd-section-space"]).toBe("6rem");
    expect(style["--bd-container"]).toBe("88rem");
    expect(style["--bd-heading-font"]).toContain("system-ui");
  });

  it("uses only locally available fonts", () => {
    // Memuat font dari jaringan menambah permintaan pemblokir render di
    // halaman yang justru dijual karena kecepatannya.
    for (const font of FONT_CHOICES) {
      const style = builderDesignTokenStyle({
        ...DEFAULT_DESIGN_TOKENS,
        bodyFont: font,
      }) as Record<string, string>;
      expect(style["--bd-body-font"]).not.toContain("http");
      expect(style["--bd-body-font"]).not.toContain("url(");
    }
  });
});

describe("revision retention", () => {
  it("keeps deliberate checkpoints well clear of autosave churn", () => {
    // Autosave jalan 1,8 detik setelah mengetik berhenti; kalau keduanya
    // berbagi satu kuota, autosave akan menggusur versi terbit kemarin.
    expect(CHECKPOINT_KEEP).toBeGreaterThan(AUTOSAVE_KEEP);
    expect(AUTOSAVE_KEEP).toBeGreaterThan(0);
  });
});
