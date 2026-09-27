import "server-only";

import { AiError, callGeminiJson, type AiUsage } from "@/lib/ai/client";
import {
  AI_MAX_ITEMS,
  AI_MAX_SECTIONS,
  AI_SECTION_PLAN_JSON_SCHEMA,
  planToBlocks,
  type AiSectionPlan,
} from "@/lib/ai/section-plan";
import type { BlockInput } from "@/lib/blocks/schema";

export type GenerateSectionsInput = {
  /** What the operator typed, e.g. "landing page kursus baking 6 section". */
  brief: string;
  workspaceName: string;
  /** "id" writes Indonesian copy, "en" writes English. */
  language: "id" | "en";
};

export type GenerateSectionsResult = {
  pageTitle: string;
  blocks: BlockInput[];
  /** Planned sections the mappers could not use. */
  skipped: number;
  usage: AiUsage;
};

/** Identical on every call; the per-request brief goes in the user message. */
const SYSTEM_PROMPT = `You are a landing-page copywriter and information architect inside Buildery, a website builder.

Given a short brief, you plan the sections of ONE page and write the copy for each. You never write HTML, CSS, or code — only structured content that the builder turns into blocks.

## Section types and what \`items\` means for each

| type | purpose | items[] |
| --- | --- | --- |
| HERO | opening section, one per page, always first | optional headline stats: title = the number ("500+"), description = what it counts ("alumni") |
| LOGOS | social proof strip of company names | title = company name |
| FEATURE_GRID | benefits or features | title = feature name, description = why it matters, detail = optional small label |
| STATS | numbers that build trust | title = the number, description = what it measures, detail = optional context |
| STEPS | how it works, in order | title = step name, description = what happens, detail = optional duration |
| PRICING | plans | title = plan name, description = who it's for, detail = the price ("Rp 249.000"), bullets = what's included, highlighted = true on the recommended plan (at most one) |
| TESTIMONIAL | customer quotes | title = person's name, description = the quote itself, detail = their role/company |
| FAQ | questions and answers | title = the question, description = the answer |
| TEXT | a paragraph of prose; put it in \`body\` | leave empty |
| CTA | a closing call to action | leave empty |
| BANNER | one-line announcement strip | leave empty |
| NEWSLETTER | email signup | leave empty |
| CONTACT_FORM | contact form | leave empty |

## Rules

- Return between 4 and ${AI_MAX_SECTIONS} sections. Start with HERO and end with CTA unless the brief clearly asks otherwise.
- At most ${AI_MAX_ITEMS} items per section. Three or four reads best for FEATURE_GRID, STEPS and STATS.
- Use each section type at most once, except TEXT.
- Every field is required. Send "" for text you don't need and [] for lists you don't need — never invent a value to fill a slot.
- Links: use "#" for every href. You cannot know the real URLs.
- Never invent specific facts — no named customers, no awards, no certifications, no precise statistics presented as real. Write numbers that are obviously placeholders the operator will edit, and keep testimonial names generic.
- Write concrete, specific copy about the actual subject in the brief. Headings under 60 characters, supporting lines one sentence.
- Do not mention Buildery, blocks, sections, or that this is a template.`;

/**
 * Asks the model for a section plan and maps it onto builder blocks.
 *
 * The model never sees the real block schemas — it fills a small flat shape
 * (see `section-plan.ts`) that the mappers translate. That keeps the prompt
 * short, the output reliable, and the styling defaults ours rather than the
 * model's guess.
 */
export async function generatePageSections(
  input: GenerateSectionsInput
): Promise<GenerateSectionsResult> {
  const language =
    input.language === "id"
      ? "Write every string in Indonesian (Bahasa Indonesia)."
      : "Write every string in English.";

  const { data: plan, usage } = await callGeminiJson<AiSectionPlan>({
    system: SYSTEM_PROMPT,
    user: [
      `Business/workspace name: ${input.workspaceName}`,
      language,
      "",
      "Brief:",
      input.brief,
    ].join("\n"),
    jsonSchema: AI_SECTION_PLAN_JSON_SCHEMA as unknown as Record<string, unknown>,
    // Choosing and ordering sections is planning, not just wording.
    reasoningEffort: "high",
    normalize: normalizePlan,
  });

  const { blocks, skipped } = planToBlocks(plan);
  if (blocks.length === 0) {
    throw new AiError("AI tidak menghasilkan section yang bisa dipakai.");
  }

  return { pageTitle: plan.pageTitle, blocks, skipped, usage };
}

/**
 * Structured outputs make the shape very likely but not guaranteed, and this
 * data goes straight into a page. Coerce everything defensively; the block
 * mappers then drop whatever is still unusable.
 */
export function normalizePlan(raw: unknown): AiSectionPlan {
  const root = asRecord(raw);
  const sections = Array.isArray(root.sections) ? root.sections : [];

  return {
    pageTitle: asString(root.pageTitle) || "Halaman baru",
    sections: sections.slice(0, AI_MAX_SECTIONS).map((entry) => {
      const section = asRecord(entry);
      const items = Array.isArray(section.items) ? section.items : [];
      return {
        type: asString(section.type),
        eyebrow: asString(section.eyebrow),
        heading: asString(section.heading),
        subheading: asString(section.subheading),
        body: asString(section.body),
        primaryLabel: asString(section.primaryLabel),
        primaryHref: asString(section.primaryHref),
        secondaryLabel: asString(section.secondaryLabel),
        secondaryHref: asString(section.secondaryHref),
        items: items.slice(0, AI_MAX_ITEMS).map((rawItem) => {
          const item = asRecord(rawItem);
          const bullets = Array.isArray(item.bullets) ? item.bullets : [];
          return {
            title: asString(item.title),
            description: asString(item.description),
            detail: asString(item.detail),
            bullets: bullets.map(asString).filter(Boolean).slice(0, 10),
            highlighted: item.highlighted === true,
          };
        }),
      };
    }),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
