import "server-only";

/**
 * Platform-level AI configuration (kie.ai — Gemini 3.8 Flash).
 *
 * The key is deliberately *not* a per-workspace integration setting: AI calls
 * cost the platform operator money, so access is gated by the SaaS plan
 * (`hasAiAssistant`), not by a key the tenant supplies.
 */

export const AI_API_BASE_URL =
  process.env.KIE_API_BASE_URL?.trim() || "https://api.kie.ai";

/**
 * kie.ai puts the model in the URL path, not the request body. The
 * `-openai` variant is the OpenAI-compatible chat-completions endpoint; the
 * bare `gemini-3-8-flash` route is Google's streaming-only
 * `streamGenerateContent` API, which does not fit these call sites.
 */
export const AI_MODEL_SLUG =
  process.env.KIE_MODEL_SLUG?.trim() || "gemini-3-8-flash-openai";

/** Human-readable name for logs and operator-facing copy. */
export const AI_MODEL_LABEL = "Gemini 3.8 Flash";

/** Generations per workspace per hour. Bounds the bill without a usage table. */
export const AI_RATE_LIMIT = 20;
export const AI_RATE_WINDOW_MS = 60 * 60 * 1000;

export function getAiApiKey(): string | null {
  const key = process.env.KIE_API_KEY?.trim();
  return key ? key : null;
}

/**
 * False on installs that never configured a key. Every AI surface checks this
 * and hides itself rather than failing at click time.
 */
export function isAiConfigured(): boolean {
  return getAiApiKey() !== null;
}

export function chatCompletionsUrl(): string {
  return `${AI_API_BASE_URL.replace(/\/+$/, "")}/${AI_MODEL_SLUG}/v1/chat/completions`;
}
