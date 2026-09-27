import {
  parseBlockData,
  type BlockInput,
  type BlockType,
} from "@/lib/blocks/schema";

/**
 * The block schemas are ~1500 lines and mostly styling. Rather than ask Claude
 * to fill them in, it emits this small, flat "section plan" — content only —
 * and the mappers below translate each entry into real block data. Zod supplies
 * every default, so a section only has to carry the words.
 *
 * Keeping the model's contract narrow is what makes the output reliable: there
 * is no layout, colour, or spacing field it can get wrong.
 */

/**
 * Section types Claude may produce. Deliberately a subset of BlockType:
 * anything needing uploaded media (GALLERY, IMAGE, VIDEO), a live collection
 * (PRODUCT_SHOWCASE), raw markup (CUSTOM_HTML), or a real date (COUNTDOWN) is
 * excluded — the model has no way to supply a correct value for those.
 */
export const AI_SECTION_TYPES = [
  "HERO",
  "LOGOS",
  "FEATURE_GRID",
  "STATS",
  "STEPS",
  "PRICING",
  "TESTIMONIAL",
  "FAQ",
  "TEXT",
  "CTA",
  "BANNER",
  "NEWSLETTER",
  "CONTACT_FORM",
] as const;

export type AiSectionType = (typeof AI_SECTION_TYPES)[number];

/** Hard cap on one generation, well under the builder's 60-block ceiling. */
export const AI_MAX_SECTIONS = 12;
/** Cap per section; longer lists are truncated rather than rejected. */
export const AI_MAX_ITEMS = 6;

export type AiSectionItem = {
  title: string;
  description: string;
  detail: string;
  bullets: string[];
  highlighted: boolean;
};

export type AiSection = {
  type: string;
  eyebrow: string;
  heading: string;
  subheading: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  items: AiSectionItem[];
};

export type AiSectionPlan = {
  pageTitle: string;
  sections: AiSection[];
};

/**
 * JSON Schema handed to the Messages API as `output_config.format`. Strict
 * mode requires every property listed in `required` and
 * `additionalProperties: false`, so nothing here is optional — the prompt
 * tells Claude to send "" or [] for fields a section doesn't use.
 */
export const AI_SECTION_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    pageTitle: {
      type: "string",
      description: "Short page title, 2-6 words, in the requested language.",
    },
    sections: {
      type: "array",
      description: `Ordered page sections, at most ${AI_MAX_SECTIONS}.`,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...AI_SECTION_TYPES] },
          eyebrow: { type: "string", description: "Small label above the heading. May be ''." },
          heading: { type: "string", description: "Section heading. May be '' for BANNER." },
          subheading: { type: "string", description: "One supporting sentence. May be ''." },
          body: { type: "string", description: "Paragraph text. TEXT sections only, else ''." },
          primaryLabel: { type: "string", description: "Main button label, or ''." },
          primaryHref: { type: "string", description: "Main button target, '#' when unknown." },
          secondaryLabel: { type: "string", description: "Secondary button label, or ''." },
          secondaryHref: { type: "string", description: "Secondary button target, '#' when unknown." },
          items: {
            type: "array",
            description: `Repeated entries; meaning depends on the section type. At most ${AI_MAX_ITEMS}. Empty for sections that take no list.`,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                detail: { type: "string" },
                bullets: { type: "array", items: { type: "string" } },
                highlighted: { type: "boolean" },
              },
              required: ["title", "description", "detail", "bullets", "highlighted"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "type",
          "eyebrow",
          "heading",
          "subheading",
          "body",
          "primaryLabel",
          "primaryHref",
          "secondaryLabel",
          "secondaryHref",
          "items",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["pageTitle", "sections"],
  additionalProperties: false,
} as const;

/**
 * `parseBlockData` validates `raw` against the schema for `type` and fills in
 * every default, so the pairing is correct by construction — the assertion
 * only re-links the two halves for the compiler, which cannot follow the
 * generic through the discriminated union.
 */
function makeBlock<T extends BlockType>(
  type: T,
  raw: Record<string, unknown>
): BlockInput {
  return { type, data: parseBlockData(type, raw) } as BlockInput;
}

/** Empty strings are how the model says "not applicable" — never emit them. */
function omitBlank(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}

function headingFields(section: AiSection) {
  return {
    eyebrow: section.eyebrow,
    heading: section.heading,
    subheading: section.subheading,
  };
}

/**
 * Translates one planned section into a builder block. Returns null for an
 * unknown type so a single bad entry drops out instead of failing the whole
 * generation.
 */
export function sectionToBlock(section: AiSection): BlockInput | null {
  const items = section.items.slice(0, AI_MAX_ITEMS);
  const base = headingFields(section);

  switch (section.type) {
    case "HERO":
      return makeBlock(
        "HERO",
        omitBlank({
          ...base,
          primaryLabel: section.primaryLabel,
          primaryHref: section.primaryHref || "#",
          secondaryLabel: section.secondaryLabel,
          secondaryHref: section.secondaryHref || "#",
          // Hero stats are value/label pairs, not cards.
          stats: items.map((item) => ({
            value: item.title,
            label: item.description,
          })),
        })
      );

    case "LOGOS":
      return makeBlock(
        "LOGOS",
        omitBlank({
          ...base,
          items: items.map((item) => ({ name: item.title })),
        })
      );

    case "FEATURE_GRID":
      return makeBlock(
        "FEATURE_GRID",
        omitBlank({
          ...base,
          columns: items.length === 4 ? 4 : items.length === 2 ? 2 : 3,
          items: items.map((item) => ({
            title: item.title,
            description: item.description,
            eyebrow: item.detail,
            highlighted: item.highlighted,
          })),
        })
      );

    case "STATS":
      return makeBlock(
        "STATS",
        omitBlank({
          ...base,
          columns: items.length === 3 ? 3 : items.length === 2 ? 2 : 4,
          items: items.map((item) => ({
            // The number goes in `title`, what it counts in `description`.
            value: item.title,
            label: item.description,
            description: item.detail,
            highlighted: item.highlighted,
          })),
        })
      );

    case "STEPS":
      return makeBlock(
        "STEPS",
        omitBlank({
          ...base,
          columns: items.length === 4 ? 4 : items.length === 2 ? 2 : 3,
          items: items.map((item) => ({
            title: item.title,
            description: item.description,
            meta: item.detail,
            highlighted: item.highlighted,
          })),
        })
      );

    case "PRICING":
      return makeBlock(
        "PRICING",
        omitBlank({
          ...base,
          columns: items.length === 2 ? 2 : items.length === 4 ? 4 : 3,
          plans: items.map((item) => ({
            name: item.title,
            description: item.description,
            price: item.detail,
            features: item.bullets,
            highlighted: item.highlighted,
            ctaLabel: section.primaryLabel || "Pilih paket",
            ctaHref: section.primaryHref || "#",
          })),
        })
      );

    case "TESTIMONIAL": {
      const [first] = items;
      return makeBlock(
        "TESTIMONIAL",
        omitBlank({
          ...base,
          // One quote reads better centred; several belong in a grid.
          layout: items.length > 1 ? "grid" : "single",
          quote: first?.description,
          authorName: first?.title,
          authorRole: first?.detail,
          items:
            items.length > 1
              ? items.map((item) => ({
                  quote: item.description,
                  authorName: item.title,
                  authorRole: item.detail,
                }))
              : [],
        })
      );
    }

    case "FAQ":
      return makeBlock(
        "FAQ",
        omitBlank({
          ...base,
          items: items.map((item, index) => ({
            question: item.title,
            answer: item.description,
            defaultOpen: index === 0,
          })),
        })
      );

    case "TEXT":
      return makeBlock(
        "TEXT",
        omitBlank({
          ...base,
          body: section.body,
          buttonLabel: section.primaryLabel,
          buttonHref: section.primaryHref || "#",
        })
      );

    case "CTA":
      return makeBlock(
        "CTA",
        omitBlank({
          eyebrow: section.eyebrow,
          heading: section.heading,
          // CTA calls its supporting line `description`, not `subheading`.
          description: section.subheading || section.body,
          buttonLabel: section.primaryLabel,
          buttonHref: section.primaryHref || "#",
          secondaryLabel: section.secondaryLabel,
          secondaryHref: section.secondaryHref || "#",
        })
      );

    case "BANNER":
      return makeBlock(
        "BANNER",
        omitBlank({
          badge: section.eyebrow,
          heading: section.heading,
          text: section.subheading || section.body,
          linkLabel: section.primaryLabel,
          linkHref: section.primaryHref || "#",
        })
      );

    case "NEWSLETTER":
      return makeBlock(
        "NEWSLETTER",
        omitBlank({
          eyebrow: section.eyebrow,
          heading: section.heading,
          description: section.subheading || section.body,
          buttonLabel: section.primaryLabel,
        })
      );

    case "CONTACT_FORM":
      return makeBlock(
        "CONTACT_FORM",
        omitBlank({
          eyebrow: section.eyebrow,
          heading: section.heading,
          description: section.subheading || section.body,
          buttonLabel: section.primaryLabel,
        })
      );

    default:
      return null;
  }
}

/**
 * Turns a whole plan into builder blocks, dropping anything unusable. Returns
 * the blocks plus how many entries were discarded, so the UI can be honest
 * about a partial result instead of silently shipping fewer sections.
 */
export function planToBlocks(plan: AiSectionPlan): {
  blocks: BlockInput[];
  skipped: number;
} {
  const blocks: BlockInput[] = [];
  let skipped = 0;

  for (const section of plan.sections.slice(0, AI_MAX_SECTIONS)) {
    const block = sectionToBlock(section);
    if (block) blocks.push(block);
    else skipped += 1;
  }

  return { blocks, skipped };
}
