import "server-only";

import {
  AI_MODEL_LABEL,
  chatCompletionsUrl,
  getAiApiKey,
} from "@/lib/ai/config";

/**
 * Minimal client for kie.ai's OpenAI-compatible chat-completions endpoint.
 *
 * No SDK: the surface used here is one POST returning one JSON object, and a
 * vendor SDK would add a dependency for less than it saves.
 */

/** Per-attempt ceiling. kie.ai can hang for 80s before returning nothing. */
const AI_TIMEOUT_MS = 60_000;
/**
 * Total attempts, including the first. Measured against the live endpoint on
 * 2026-09-04: it returned an empty body on roughly 25-40% of calls regardless
 * of prompt size or reasoning_effort, while successful calls landed in 8-33s.
 * Four attempts turn that into a sub-1% failure rate.
 */
const AI_MAX_ATTEMPTS = 4;
/** Wall-clock budget across all attempts, so a server action cannot hang. */
const AI_TOTAL_BUDGET_MS = 120_000;

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiJsonResult<T> = { data: T; usage: AiUsage };

export class AiError extends Error {}

/**
 * Sends a system + user prompt and returns the model's raw text reply.
 *
 * `stream` is sent explicitly because kie.ai defaults it to **true** — omit it
 * and the response is server-sent events, not the JSON object this parses.
 */
export type GeminiCallInput = {
  system: string;
  user: string;
  /** Shape hint passed to the provider's JSON mode. */
  jsonSchema?: Record<string, unknown>;
  /** "low" is enough for copywriting; "high" for planning work. */
  reasoningEffort?: "low" | "high";
};

/**
 * A failure worth trying again: gateway errors, timeouts, and the empty or
 * truncated replies kie.ai returns when its upstream is degraded. Auth,
 * billing, and malformed-request failures are never retried — repeating them
 * only burns time.
 */
class RetryableAiError extends AiError {}

/**
 * Runs one provider operation, retrying transient failures with backoff.
 *
 * The provider is genuinely flaky: the same request can return a full answer
 * one hour and an empty body with `code: 524` the next. Without this a single
 * bad minute surfaced to the operator as a hard failure. One loop covers both
 * transport and parse failures so a call never costs more than
 * AI_MAX_ATTEMPTS requests.
 */
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof RetryableAiError;
      const budgetLeft = Date.now() - startedAt < AI_TOTAL_BUDGET_MS;
      if (!retryable || attempt === AI_MAX_ATTEMPTS || !budgetLeft) break;

      // 1s, then 3s, with jitter so parallel callers don't sync up.
      const backoff = attempt * 2000 - 1000 + Math.floor(Math.random() * 500);
      console.warn(
        `[ai] attempt ${attempt}/${AI_MAX_ATTEMPTS} failed, retrying in ${backoff}ms:`,
        error instanceof Error ? error.message : error
      );
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiError("Panggilan AI gagal.");
}

/** Sends a system + user prompt and returns the model's raw text reply. */
export async function callGeminiText(
  input: GeminiCallInput
): Promise<{ text: string; usage: AiUsage }> {
  return withRetry(() => attemptGeminiCall(input));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptGeminiCall(
  input: GeminiCallInput
): Promise<{ text: string; usage: AiUsage }> {
  const apiKey = getAiApiKey();
  if (!apiKey) {
    throw new AiError(
      "KIE_API_KEY belum diatur. Tambahkan di .env lalu reload aplikasi."
    );
  }

  // kie.ai rejects `response_format.type: "json_schema"` (its upstream returns
  // a 500), so JSON mode is the plain `json_object` form and the schema is
  // stated in the prompt instead. Verified against the live endpoint.
  const user = input.jsonSchema
    ? `${input.user}\n\nReturn a single JSON object matching this JSON Schema exactly. No prose, no markdown fence.\n${JSON.stringify(
        input.jsonSchema
      )}`
    : input.user;

  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: user },
    ],
    // Defaults to true upstream; omitting it returns server-sent events.
    stream: false,
    reasoning_effort: input.reasoningEffort ?? "low",
  };
  if (input.jsonSchema) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(chatCompletionsUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new RetryableAiError(
        `${AI_MODEL_LABEL} tidak merespons dalam ${AI_TIMEOUT_MS / 1000} detik.`
      );
    }
    throw new RetryableAiError(
      `Tidak bisa menghubungi kie.ai: ${describe(error)}`
    );
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    const message = describeHttpError(res.status, raw);
    throw res.status >= 500 || res.status === 429
      ? new RetryableAiError(message)
      : new AiError(message);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new AiError("Respons kie.ai bukan JSON yang valid.");
  }

  // kie.ai reports application errors with HTTP 200 and a {code,msg} envelope,
  // so the status line alone is not enough to call a request successful.
  const envelope = readErrorEnvelope(payload);
  if (envelope) {
    throw isRetryableCode(payload)
      ? new RetryableAiError(envelope)
      : new AiError(envelope);
  }

  const text = readContent(payload);
  // A 200 with no content is what a degraded upstream looks like here, so it
  // is worth another attempt rather than an error the operator can't act on.
  if (!text) {
    throw new RetryableAiError(
      `${AI_MODEL_LABEL} mengembalikan jawaban kosong.`
    );
  }

  return { text, usage: readUsage(payload) };
}

/**
 * Same call, but parses the reply as JSON. Providers routinely wrap JSON in a
 * markdown fence even in JSON mode, so the fence is stripped before parsing.
 */
export async function callGeminiJson<T>(
  input: GeminiCallInput & {
    /** Coerces the parsed value into the caller's expected shape. */
    normalize: (raw: unknown) => T;
  }
): Promise<AiJsonResult<T>> {
  return withRetry(async () => {
    const { text, usage } = await attemptGeminiCall(input);
    const json = extractJsonObject(text);
    // A degraded upstream also returns 200s carrying truncated text, which
    // parses as neither JSON nor an error envelope — retry those too.
    if (json === null) {
      console.warn("[ai] unparseable reply:", text.slice(0, 120));
      throw new RetryableAiError(
        `Respons ${AI_MODEL_LABEL} bukan JSON yang valid.`
      );
    }
    return { data: input.normalize(json), usage };
  });
}

/**
 * Pulls a JSON object out of a model reply: handles a bare object, a
 * ```json fenced block, and prose wrapped around either.
 */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  const direct = tryParse(candidate);
  if (direct !== undefined) return direct;

  // Fall back to the outermost braces, for replies padded with commentary.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const sliced = tryParse(candidate.slice(start, end + 1));
  return sliced === undefined ? null : sliced;
}

function tryParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Returns a message when the body carries kie.ai's error envelope. `code` is
 * only an error when it is present and not a success code — successful
 * completions carry no `code` at all.
 */
export function readErrorEnvelope(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!("code" in record)) return null;
  const code = record.code;
  if (typeof code !== "number" || code === 200 || code === 0) return null;
  const msg = firstString([record.msg, record.message]) ?? "tanpa keterangan";
  if (code === 401 || code === 403) {
    return `kie.ai menolak API key (${code}). Periksa KIE_API_KEY.`;
  }
  if (code === 402) return "Saldo kie.ai habis. Isi ulang untuk memakai fitur AI.";
  if (code === 429) {
    return "kie.ai sedang membatasi permintaan (rate limit). Coba lagi sebentar lagi.";
  }
  return `kie.ai menolak permintaan (${code}): ${msg}`;
}

/** Gateway-side envelope codes (5xx, 429) are worth another attempt. */
function isRetryableCode(payload: unknown): boolean {
  const code = asRecord(payload).code;
  return typeof code === "number" && (code >= 500 || code === 429);
}

function readContent(payload: unknown): string {
  const choices = asRecord(payload).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = asRecord(asRecord(choices[0]).message);
  const content = message.content;
  if (typeof content === "string") return content.trim();
  // Some gateways return the content as an array of parts.
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const text = asRecord(part).text;
        return typeof text === "string" ? text : "";
      })
      .join("")
      .trim();
  }
  return "";
}

function readUsage(payload: unknown): AiUsage {
  const usage = asRecord(asRecord(payload).usage);
  const num = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return {
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    totalTokens: num(usage.total_tokens),
  };
}

/** Keeps the provider's own words — the fastest way to spot a bad key. */
function describeHttpError(status: number, rawBody: string): string {
  const record = asRecord(tryParse(rawBody));
  const nested = asRecord(record.error);
  const detail =
    firstString([nested.message, record.message, record.msg, record.error]) ??
    rawBody.trim().slice(0, 300);

  if (status === 401 || status === 403) {
    return `kie.ai menolak API key (HTTP ${status}). Periksa KIE_API_KEY.`;
  }
  if (status === 429) {
    return "kie.ai sedang membatasi permintaan (rate limit). Coba lagi sebentar lagi.";
  }
  if (status === 402) {
    return "Saldo kie.ai habis. Isi ulang untuk memakai fitur AI.";
  }
  return `kie.ai mengembalikan HTTP ${status}: ${detail || "tanpa keterangan"}`;
}

/** Turns any thrown value into something safe to show a workspace operator. */
export function describeAiError(error: unknown): string {
  if (error instanceof AiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan saat memanggil AI.";
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
