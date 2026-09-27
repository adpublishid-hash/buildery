import { describe, expect, it } from "vitest";

import {
  DEFAULT_DESIGN_TOKENS,
  builderDesignTokensSchema,
  parseBuilderDesignTokens,
} from "@/lib/builder-design-tokens";
import {
  darkModeAttribute,
  darkModeCss,
  darkModeVariables,
} from "@/lib/builder-dark-mode";

const dark = { ...DEFAULT_DESIGN_TOKENS, colorScheme: "dark" as const };
const auto = { ...DEFAULT_DESIGN_TOKENS, colorScheme: "auto" as const };

describe("dark mode tokens stay backward compatible", () => {
  it("defaults an existing site to light, not dark", () => {
    // Menyalakan mode gelap pada situs yang sudah tayang tanpa diminta akan
    // mengubah tampilannya di depan pengunjung.
    const legacy = {
      accentColor: "#ff5500",
      backgroundColor: "#ffffff",
      textColor: "#18181b",
      headingFont: "system",
      bodyFont: "system",
      radius: "md",
    };
    expect(parseBuilderDesignTokens(legacy).colorScheme).toBe("light");
  });

  it("rejects a dark colour that is not six hex digits", () => {
    expect(
      builderDesignTokensSchema.safeParse({
        ...DEFAULT_DESIGN_TOKENS,
        darkBackgroundColor: "black",
      }).success
    ).toBe(false);
  });
});

describe("darkModeCss", () => {
  it("emits nothing for a light site", () => {
    expect(darkModeCss(DEFAULT_DESIGN_TOKENS)).toBeNull();
  });

  it("maps the surface and text utilities blocks actually use", () => {
    const css = darkModeCss(dark)!;
    for (const utility of [
      "bg-white",
      "bg-zinc-50",
      "bg-zinc-100",
      "text-zinc-900",
      "text-zinc-950",
      "text-zinc-500",
      "border-zinc-200",
    ]) {
      expect(css).toContain(`.${utility}{`);
    }
  });

  it("scopes every rule so nothing leaks into the dashboard", () => {
    const css = darkModeCss(dark)!;
    const selectors = css.split("}").filter(Boolean);
    for (const rule of selectors) {
      expect(rule).toContain('[data-bd-scheme="dark"]');
    }
  });

  it("wins over the plain utility without needing !important", () => {
    // Selektor bercakupan punya spesifisitas lebih tinggi; kalau sampai butuh
    // !important, warna pilihan pemilik situs ikut tertimpa.
    const css = darkModeCss(dark)!;
    expect(css).not.toContain("!important");
    expect(css).toContain('[data-bd-scheme="dark"] .bg-white{');
  });

  it("wraps auto mode in a media query so light devices stay light", () => {
    const css = darkModeCss(auto)!;
    expect(css.startsWith("@media (prefers-color-scheme: dark){")).toBe(true);
    expect(css.endsWith("}")).toBe(true);
  });

  it("does not wrap an explicitly dark site in a media query", () => {
    expect(darkModeCss(dark)!).not.toContain("prefers-color-scheme");
  });

  it("leaves accent-coloured text alone", () => {
    // text-white dipakai untuk tombol di atas permukaan berwarna; memetakannya
    // akan menghilangkan kontrasnya.
    expect(darkModeCss(dark)!).not.toContain(".text-white{");
  });
});

describe("darkModeAttribute", () => {
  it("marks both dark and auto, and leaves light unmarked", () => {
    expect(darkModeAttribute(DEFAULT_DESIGN_TOKENS)).toBeUndefined();
    expect(darkModeAttribute(dark)).toBe("dark");
    // Auto ikut ditandai; media query di CSS yang memutuskan.
    expect(darkModeAttribute(auto)).toBe("dark");
  });
});

describe("darkModeVariables", () => {
  it("exposes the owner's chosen dark colours", () => {
    expect(
      darkModeVariables({
        ...dark,
        darkBackgroundColor: "#001122",
        darkSurfaceColor: "#112233",
        darkTextColor: "#eeffee",
      })
    ).toEqual({
      "--bd-dark-bg": "#001122",
      "--bd-dark-surface": "#112233",
      "--bd-dark-text": "#eeffee",
    });
  });
});
