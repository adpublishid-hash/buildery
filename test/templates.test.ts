import { describe, expect, it } from "vitest";

import { pageBlocksSchema } from "@/lib/blocks/schema";
import { hasCustomAnimation } from "@/lib/blocks/animation";
import {
  BUILDER_TEMPLATES,
  createTemplateBlocks,
} from "@/lib/blocks/templates";

describe("builder templates", () => {
  it("exposes the Soleva AIDA shoe template with editable native blocks", () => {
    const metadata = BUILDER_TEMPLATES.find(
      (template) => template.id === "soleva-aida-shoes"
    );
    const blocks = createTemplateBlocks("soleva-aida-shoes");

    expect(metadata?.blockCount).toBe(14);
    expect(blocks).toHaveLength(14);
    expect(blocks.map((block) => block.type)).toEqual([
      "HEADER",
      "HERO",
      "MARQUEE",
      "TEXT",
      "FEATURE_GRID",
      "GALLERY",
      "COMPARISON_TABLE",
      "TESTIMONIAL",
      "PRICING",
      "TEXT",
      "COUNTDOWN",
      "FAQ",
      "CTA",
      "FOOTER",
    ]);
    expect(blocks.every((block) => block.type !== "CUSTOM_HTML")).toBe(true);
    expect(
      blocks.every((block) =>
        hasCustomAnimation((block.data as { motion?: unknown }).motion)
      )
    ).toBe(true);
    expect(pageBlocksSchema.safeParse(blocks).success).toBe(true);
  });

  it("exposes the FluentLab AIDA English class template with motion", () => {
    const metadata = BUILDER_TEMPLATES.find(
      (template) => template.id === "fluentlab-english-class"
    );
    const blocks = createTemplateBlocks("fluentlab-english-class");

    expect(metadata?.blockCount).toBe(17);
    expect(blocks).toHaveLength(17);
    expect(blocks.map((block) => block.type)).toEqual([
      "HEADER",
      "HERO",
      "MARQUEE",
      "STATS",
      "TEXT",
      "FEATURE_GRID",
      "STEPS",
      "COLUMNS",
      "IMAGE",
      "TEXT",
      "TESTIMONIAL",
      "PRICING",
      "TEXT",
      "COUNTDOWN",
      "FAQ",
      "CTA",
      "FOOTER",
    ]);
    expect(blocks.every((block) => block.type !== "CUSTOM_HTML")).toBe(true);
    expect(
      blocks.every((block) =>
        hasCustomAnimation((block.data as { motion?: unknown }).motion)
      )
    ).toBe(true);
    expect(pageBlocksSchema.safeParse(blocks).success).toBe(true);
  });

  it.each([
    {
      id: "atlas-executive-cv" as const,
      count: 8,
      types: ["HERO", "TEXT", "STEPS", "COLUMNS", "FEATURE_GRID", "FEATURE_GRID", "CTA", "FOOTER"],
    },
    {
      id: "jason-creator-portfolio" as const,
      count: 10,
      types: ["HEADER", "HERO", "LOGOS", "FEATURE_GRID", "COLUMNS", "STATS", "CONTACT_FORM", "FAQ", "CTA", "FOOTER"],
    },
    {
      id: "maison-editorial-cv" as const,
      count: 10,
      types: ["HEADER", "TEXT", "COLUMNS", "FEATURE_GRID", "COLUMNS", "LOGOS", "TESTIMONIAL", "CONTACT_FORM", "CTA", "FOOTER"],
    },
    {
      id: "albert-video-producer" as const,
      count: 10,
      types: ["HERO", "LOGOS", "STATS", "FEATURE_GRID", "GALLERY", "COLUMNS", "COLUMNS", "TESTIMONIAL", "CTA", "FOOTER"],
    },
    {
      id: "albert-notion-consultant" as const,
      count: 9,
      types: ["HERO", "MENU", "FEATURE_GRID", "FEATURE_GRID", "FEATURE_GRID", "COLUMNS", "COLUMNS", "CTA", "FOOTER"],
    },
    {
      id: "albert-creative-resume" as const,
      count: 9,
      types: ["HEADER", "HERO", "STATS", "FEATURE_GRID", "STEPS", "COLUMNS", "TESTIMONIAL", "CONTACT_FORM", "FOOTER"],
    },
  ])("exposes editable motion-ready CV template $id", ({ id, count, types }) => {
    const metadata = BUILDER_TEMPLATES.find((template) => template.id === id);
    const blocks = createTemplateBlocks(id);

    expect(metadata?.blockCount).toBe(count);
    expect(blocks).toHaveLength(count);
    expect(blocks.map((block) => block.type)).toEqual(types);
    expect(blocks.every((block) => block.type !== "CUSTOM_HTML")).toBe(true);
    expect(
      blocks.every((block) =>
        hasCustomAnimation((block.data as { motion?: unknown }).motion)
      )
    ).toBe(true);
    expect(pageBlocksSchema.safeParse(blocks).success).toBe(true);
  });

  it("creates fresh block data for every import", () => {
    for (const template of BUILDER_TEMPLATES) {
      const first = createTemplateBlocks(template.id);
      const second = createTemplateBlocks(template.id);

      const firstMotion = (first[0].data as { motion: { duration: number } }).motion;
      const secondMotion = (second[0].data as { motion: { duration: number } }).motion;
      firstMotion.duration = 3.75;
      expect(secondMotion.duration).not.toBe(3.75);
    }
  });
});
