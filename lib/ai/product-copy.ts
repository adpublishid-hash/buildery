import "server-only";

import { callGeminiJson, type AiUsage } from "@/lib/ai/client";

export type ProductCopyInput = {
  name: string;
  /** Whatever the seller has typed so far — keywords, half a sentence, notes. */
  hint: string;
  type: "PHYSICAL" | "DIGITAL" | "SERVICE" | "EVENT" | "BUNDLE";
  /** Formatted price string, or "" when not set yet. */
  price: string;
  workspaceName: string;
  language: "id" | "en";
};

export type ProductCopy = {
  description: string;
  details: string;
  metaTitle: string;
  metaDescription: string;
};

export type ProductCopyResult = ProductCopy & { usage: AiUsage };

/** Search engines truncate past roughly these lengths; keep the model honest. */
const META_TITLE_MAX = 60;
const META_DESCRIPTION_MAX = 155;

const PRODUCT_COPY_JSON_SCHEMA = {
  type: "object",
  properties: {
    description: {
      type: "string",
      description:
        "Short selling description for the product page, 2-3 sentences.",
    },
    details: {
      type: "string",
      description:
        "Longer detail copy: what's included, how it works, who it suits. Plain text, may use '- ' bullet lines. 4-8 lines.",
    },
    metaTitle: {
      type: "string",
      description: `Search result title, at most ${META_TITLE_MAX} characters.`,
    },
    metaDescription: {
      type: "string",
      description: `Search result summary, at most ${META_DESCRIPTION_MAX} characters.`,
    },
  },
  required: ["description", "details", "metaTitle", "metaDescription"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You write product copy for sellers on Buildery, an online store builder used mostly by small Indonesian businesses.

Rules:
- Write about the actual product described. Be concrete and specific; avoid filler like "berkualitas tinggi" or "solusi terbaik" with nothing behind it.
- Never invent facts you were not given: no certifications, no awards, no ingredient lists, no shipping times, no guarantees, no review counts, no fake specifications.
- If the seller's notes are thin, write copy that is honest and general rather than inventing detail. It is better to be brief than to be wrong.
- Do not mention a price unless one was given.
- No emoji. No ALL CAPS. No markdown headings — plain text, and "- " for bullet lines only inside \`details\`.
- metaTitle: at most ${META_TITLE_MAX} characters. metaDescription: at most ${META_DESCRIPTION_MAX} characters. Both must read naturally, not as keyword lists.`;

/**
 * Drafts the four copy fields on the product form. Everything is a starting
 * point the seller edits — the prompt is tuned to avoid confident invention,
 * because a made-up certification on a product page is a real-world problem.
 */
export async function generateProductCopy(
  input: ProductCopyInput
): Promise<ProductCopyResult> {
  const kind = {
    PHYSICAL: "a physical product that ships to the buyer",
    DIGITAL: "a digital product delivered online",
    SERVICE: "a service the seller performs",
    EVENT: "a ticketed event",
    BUNDLE: "a package of several products sold together",
  }[input.type];

  const { data, usage } = await callGeminiJson<ProductCopy>({
    system: SYSTEM_PROMPT,
    user: [
      `Store: ${input.workspaceName}`,
      `Product name: ${input.name}`,
      `This is ${kind}.`,
      input.price ? `Price: ${input.price}` : "Price: not set yet.",
      input.language === "id"
        ? "Write in Indonesian (Bahasa Indonesia)."
        : "Write in English.",
      "",
      input.hint
        ? `Seller's notes:\n${input.hint}`
        : "The seller gave no extra notes — work from the product name alone and stay general.",
    ].join("\n"),
    jsonSchema: PRODUCT_COPY_JSON_SCHEMA as unknown as Record<string, unknown>,
    normalize: normalizeProductCopy,
  });

  return { ...data, usage };
}

/**
 * Trims the meta fields to what search engines actually show. The model is
 * asked for these limits, but a truncated title beats one that silently gets
 * cut off in results.
 */
export function normalizeProductCopy(raw: unknown): ProductCopy {
  const root =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const str = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";

  return {
    description: str(root.description),
    details: str(root.details),
    metaTitle: clip(str(root.metaTitle), META_TITLE_MAX),
    metaDescription: clip(str(root.metaDescription), META_DESCRIPTION_MAX),
  };
}

/** Cuts at a word boundary so the result never ends mid-word. */
function clip(value: string, max: number) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}
