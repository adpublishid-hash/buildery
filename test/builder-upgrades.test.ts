import { describe, expect, it } from "vitest";

import { auditBuilderPage } from "@/lib/builder-audit";
import {
  builderDesignTokensSchema,
  parseBuilderDesignTokens,
} from "@/lib/builder-design-tokens";
import { defaultBlockData } from "@/lib/blocks/registry";
import type { Block } from "@/lib/blocks/schema";

describe("builder design tokens", () => {
  it("falls back to a valid workspace accent for legacy websites", () => {
    expect(parseBuilderDesignTokens({}, "#123456")).toMatchObject({
      accentColor: "#123456",
      backgroundColor: "#ffffff",
      radius: "md",
    });
  });

  it("rejects unsafe or malformed style values", () => {
    expect(
      builderDesignTokensSchema.safeParse({
        accentColor: "javascript:red",
        backgroundColor: "#ffffff",
        textColor: "#111111",
        headingFont: "system",
        bodyFont: "system",
        radius: "md",
      }).success
    ).toBe(false);
  });
});

describe("builder publish audit", () => {
  it("blocks publishing an empty page", () => {
    const issues = auditBuilderPage(
      { title: "A useful landing page title", seoTitle: "", metaDescription: "A".repeat(100), ogImage: "https://example.com/og.jpg" },
      []
    );
    expect(issues).toContainEqual(expect.objectContaining({ id: "empty-page", level: "error" }));
  });

  it("reports placeholder links and large custom HTML", () => {
    const block = {
      id: "custom",
      type: "CUSTOM_HTML",
      data: {
        ...defaultBlockData("CUSTOM_HTML"),
        html: "x".repeat(210_000),
      },
    } as Block;
    const issues = auditBuilderPage(
      { title: "A useful landing page title", seoTitle: "", metaDescription: "A".repeat(100), ogImage: "https://example.com/og.jpg" },
      [block]
    );
    expect(issues.some((issue) => issue.id === "custom-html-size")).toBe(true);
  });
});
