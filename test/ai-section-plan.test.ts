import { describe, expect, it } from "vitest";

import {
  AI_MAX_ITEMS,
  AI_MAX_SECTIONS,
  AI_SECTION_PLAN_JSON_SCHEMA,
  AI_SECTION_TYPES,
  planToBlocks,
  sectionToBlock,
  type AiSection,
  type AiSectionItem,
} from "@/lib/ai/section-plan";
import { normalizePlan } from "@/lib/ai/page-sections";
import type { BlockDataMap, BlockInput, BlockType } from "@/lib/blocks/schema";

function item(overrides: Partial<AiSectionItem> = {}): AiSectionItem {
  return {
    title: "",
    description: "",
    detail: "",
    bullets: [],
    highlighted: false,
    ...overrides,
  };
}

function section(overrides: Partial<AiSection> = {}): AiSection {
  return {
    type: "HERO",
    eyebrow: "",
    heading: "",
    subheading: "",
    body: "",
    primaryLabel: "",
    primaryHref: "",
    secondaryLabel: "",
    secondaryHref: "",
    items: [],
    ...overrides,
  };
}

/**
 * Asserts the block is of the expected type and hands back its typed data.
 * BlockDataMap is a plain lookup, so indexing it with the generic keeps the
 * assertions type-checked (Extract over the union collapses to never here).
 */
function dataOf<T extends BlockType>(
  block: BlockInput | null,
  type: T
): BlockDataMap[T] {
  expect(block).not.toBeNull();
  expect(block!.type).toBe(type);
  return block!.data as BlockDataMap[T];
}

describe("sectionToBlock", () => {
  it("turns hero items into value/label stats", () => {
    const data = dataOf(
      sectionToBlock(
        section({
          type: "HERO",
          heading: "Kursus baking untuk pemula",
          subheading: "Belajar dari rumah, mulai hari ini.",
          primaryLabel: "Daftar sekarang",
          items: [
            item({ title: "500+", description: "alumni" }),
            item({ title: "4.9/5", description: "rating" }),
          ],
        })
      ),
      "HERO"
    );

    expect(data.heading).toBe("Kursus baking untuk pemula");
    expect(data.primaryLabel).toBe("Daftar sekarang");
    expect(data.stats).toEqual([
      { value: "500+", label: "alumni" },
      { value: "4.9/5", label: "rating" },
    ]);
    // Styling is ours, never the model's.
    expect(data.layout).toBe("centered");
  });

  it("defaults every href to # when the model leaves it blank", () => {
    const data = dataOf(
      sectionToBlock(section({ type: "HERO", primaryLabel: "Mulai" })),
      "HERO"
    );

    expect(data.primaryHref).toBe("#");
    expect(data.secondaryHref).toBe("#");
  });

  it("keeps schema defaults instead of writing empty strings over them", () => {
    // The model sends "" for fields it doesn't use; that must not blank out
    // the placeholder copy the builder shows.
    const data = dataOf(sectionToBlock(section({ type: "FAQ" })), "FAQ");

    expect(data.heading).toBe("Frequently asked questions");
  });

  it("maps a stat's number and unit into the right fields", () => {
    const data = dataOf(
      sectionToBlock(
        section({
          type: "STATS",
          items: [
            item({ title: "12K+", description: "pengguna aktif", detail: "2026" }),
            item({ title: "99.9%", description: "uptime" }),
            item({ title: "24/7", description: "dukungan" }),
          ],
        })
      ),
      "STATS"
    );

    expect(data.items[0]).toMatchObject({
      value: "12K+",
      label: "pengguna aktif",
      description: "2026",
    });
    expect(data.columns).toBe(3);
  });

  it("builds pricing plans with price, features, and one highlight", () => {
    const data = dataOf(
      sectionToBlock(
        section({
          type: "PRICING",
          primaryLabel: "Ambil paket",
          items: [
            item({
              title: "Dasar",
              description: "Untuk mulai",
              detail: "Rp 249.000",
              bullets: ["4 sesi", "Grup WhatsApp"],
            }),
            item({
              title: "Pro",
              description: "Paling lengkap",
              detail: "Rp 749.000",
              bullets: ["12 sesi", "Konsultasi 1-on-1"],
              highlighted: true,
            }),
          ],
        })
      ),
      "PRICING"
    );

    expect(data.plans).toHaveLength(2);
    expect(data.plans[1]).toMatchObject({
      name: "Pro",
      price: "Rp 749.000",
      features: ["12 sesi", "Konsultasi 1-on-1"],
      highlighted: true,
      ctaLabel: "Ambil paket",
    });
    expect(data.columns).toBe(2);
  });

  it("renders one testimonial as a single quote and several as a grid", () => {
    const one = dataOf(
      sectionToBlock(
        section({
          type: "TESTIMONIAL",
          items: [
            item({ title: "Rina", description: "Kelasnya jelas.", detail: "Ibu rumah tangga" }),
          ],
        })
      ),
      "TESTIMONIAL"
    );
    expect(one.layout).toBe("single");
    expect(one.quote).toBe("Kelasnya jelas.");
    expect(one.authorName).toBe("Rina");
    expect(one.items).toEqual([]);

    const many = dataOf(
      sectionToBlock(
        section({
          type: "TESTIMONIAL",
          items: [
            item({ title: "Rina", description: "Kelasnya jelas." }),
            item({ title: "Dimas", description: "Langsung praktik." }),
          ],
        })
      ),
      "TESTIMONIAL"
    );
    expect(many.layout).toBe("grid");
    expect(many.items).toHaveLength(2);
  });

  it("opens the first FAQ entry only", () => {
    const data = dataOf(
      sectionToBlock(
        section({
          type: "FAQ",
          items: [
            item({ title: "Berapa lama?", description: "Empat minggu." }),
            item({ title: "Ada sertifikat?", description: "Ada." }),
          ],
        })
      ),
      "FAQ"
    );

    expect(data.items.map((entry) => entry.defaultOpen)).toEqual([true, false]);
  });

  it("moves a CTA's supporting line into `description`, not `subheading`", () => {
    const data = dataOf(
      sectionToBlock(
        section({
          type: "CTA",
          heading: "Siap mulai?",
          subheading: "Kelas berikutnya dibuka minggu depan.",
          primaryLabel: "Daftar",
        })
      ),
      "CTA"
    );

    expect(data.description).toBe("Kelas berikutnya dibuka minggu depan.");
    expect(data.buttonLabel).toBe("Daftar");
  });

  it("truncates an over-long item list rather than rejecting the section", () => {
    const data = dataOf(
      sectionToBlock(
        section({
          type: "FEATURE_GRID",
          items: Array.from({ length: AI_MAX_ITEMS + 4 }, (_, index) =>
            item({ title: `Fitur ${index}`, description: "..." })
          ),
        })
      ),
      "FEATURE_GRID"
    );

    expect(data.items).toHaveLength(AI_MAX_ITEMS);
  });

  it("returns null for a type outside the allowed set", () => {
    expect(sectionToBlock(section({ type: "CUSTOM_HTML" }))).toBeNull();
    expect(sectionToBlock(section({ type: "nonsense" }))).toBeNull();
  });

  it("maps every advertised section type to a block", () => {
    for (const type of AI_SECTION_TYPES) {
      expect(sectionToBlock(section({ type }))).not.toBeNull();
    }
  });
});

describe("planToBlocks", () => {
  it("drops unusable sections and reports how many", () => {
    const result = planToBlocks({
      pageTitle: "Kursus Baking",
      sections: [
        section({ type: "HERO" }),
        section({ type: "CUSTOM_HTML" }),
        section({ type: "CTA" }),
      ],
    });

    expect(result.blocks.map((block) => block.type)).toEqual(["HERO", "CTA"]);
    expect(result.skipped).toBe(1);
  });

  it("caps a runaway plan at the section limit", () => {
    const result = planToBlocks({
      pageTitle: "Panjang",
      sections: Array.from({ length: AI_MAX_SECTIONS + 5 }, () =>
        section({ type: "TEXT" })
      ),
    });

    expect(result.blocks).toHaveLength(AI_MAX_SECTIONS);
  });
});

describe("normalizePlan", () => {
  it("coerces a malformed response instead of throwing", () => {
    const plan = normalizePlan({
      pageTitle: 42,
      sections: [
        {
          type: "HERO",
          heading: "  Judul  ",
          items: [{ title: "500+", bullets: ["a", 7, "b"], highlighted: "yes" }],
        },
        "not an object",
      ],
    });

    expect(plan.pageTitle).toBe("Halaman baru");
    expect(plan.sections[0].heading).toBe("Judul");
    expect(plan.sections[0].items[0].bullets).toEqual(["a", "b"]);
    // Only a real boolean counts as highlighted.
    expect(plan.sections[0].items[0].highlighted).toBe(false);
    expect(plan.sections[1].type).toBe("");
  });

  it("survives a response with no sections at all", () => {
    expect(normalizePlan(null)).toEqual({
      pageTitle: "Halaman baru",
      sections: [],
    });
  });
});

describe("AI_SECTION_PLAN_JSON_SCHEMA", () => {
  /**
   * Structured outputs run in strict mode: every property must appear in
   * `required` and every object must set `additionalProperties: false`. A
   * mismatch is a 400 at call time, which is exactly the failure a unit test
   * should catch instead of production.
   */
  function assertStrict(node: unknown, path = "root") {
    if (!node || typeof node !== "object") return;
    const schema = node as Record<string, any>;

    if (schema.type === "object") {
      const properties = Object.keys(schema.properties ?? {});
      const required: string[] = schema.required ?? [];

      expect(
        properties.filter((name) => !required.includes(name)),
        `${path}: properties missing from required`
      ).toEqual([]);
      expect(
        required.filter((name) => !properties.includes(name)),
        `${path}: required names with no property`
      ).toEqual([]);
      expect(schema.additionalProperties, `${path}`).toBe(false);

      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        assertStrict(value, `${path}.${key}`);
      }
    }

    if (schema.type === "array") assertStrict(schema.items, `${path}[]`);
  }

  it("is strict-mode consistent all the way down", () => {
    assertStrict(AI_SECTION_PLAN_JSON_SCHEMA);
  });

  it("is serializable and offers exactly the mappable section types", () => {
    const roundTripped = JSON.parse(
      JSON.stringify(AI_SECTION_PLAN_JSON_SCHEMA)
    );
    const offered =
      roundTripped.properties.sections.items.properties.type.enum;

    expect(offered).toEqual([...AI_SECTION_TYPES]);
  });
});
