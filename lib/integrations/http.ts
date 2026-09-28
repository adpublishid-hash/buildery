import "server-only";

/** A provider call failed; `message` is safe to show the operator. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True for 5xx, 429, and network errors: a later retry may succeed. */
    readonly retryable = false
  ) {
    super(message);
  }
}

export type TestResult = { ok: true; detail?: string } | { ok: false; error: string };

/**
 * fetch with a timeout and a readable error. Parses JSON when the response is
 * JSON, otherwise returns the text. Non-2xx responses throw ProviderError with
 * the provider's own message when it gives one.
 */
export async function providerFetch<T = unknown>(
  providerName: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, { ...rest, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : error instanceof Error ? error.message : String(error);
    throw new ProviderError(`${providerName} could not be reached (${reason}).`, undefined, true);
  }
  const text = await response.text();
  let body: unknown = text;
  if (text && (response.headers.get("content-type") ?? "").includes("json")) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } else if (text && /^[[{]/.test(text.trim())) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const detail = extractErrorMessage(body) || response.statusText || "request failed";
    throw new ProviderError(
      `${providerName} ${response.status}: ${detail}`.slice(0, 500),
      response.status,
      response.status >= 500 || response.status === 429
    );
  }
  return body as T;
}

/** Pulls a human message out of the many error shapes providers use. */
export function extractErrorMessage(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return body.slice(0, 300);
  if (typeof body !== "object") return String(body);
  const record = body as Record<string, unknown>;
  for (const key of ["message", "error_description", "error", "detail", "status_message", "statusMessage", "Message", "description"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value.slice(0, 300);
    if (value && typeof value === "object") {
      const nested = extractErrorMessage(value);
      if (nested) return nested;
    }
  }
  if (Array.isArray(record.errors) && record.errors.length) return extractErrorMessage(record.errors[0]);
  return "";
}

export async function asTestResult(run: () => Promise<string | void>): Promise<TestResult> {
  try {
    const detail = await run();
    return { ok: true, detail: detail || undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function basicAuth(user: string, password: string) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}
