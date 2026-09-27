import "server-only";

import { createHash } from "node:crypto";

import { rateLimitShared } from "@/lib/rate-limit";
import type { MetaCustomData } from "@/lib/meta-capi";

export const META_VIEW_CONTENT_THROTTLE_MS = 30 * 60 * 1000;

export type MetaVisitorThrottleInput = {
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
};

export async function shouldSendServerViewContent(input: {
  workspaceId: string;
  customData: MetaCustomData | null;
} & MetaVisitorThrottleInput) {
  const content = metaContentFingerprint(input.customData);
  if (!content) return true;

  const visitor = metaVisitorFingerprint(input);
  const result = await rateLimitShared(
    `meta-view-content:${input.workspaceId}:${content}:${visitor}`,
    1,
    META_VIEW_CONTENT_THROTTLE_MS
  );
  return result.ok;
}

export function metaContentFingerprint(customData: MetaCustomData | null) {
  const ids =
    customData?.content_ids?.length
      ? customData.content_ids
      : customData?.contents?.map((item) => item.id);
  const normalized = Array.from(
    new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean))
  );
  if (normalized.length === 0) return null;
  return hashPart(normalized.slice(0, 20).join("|"));
}

export function metaVisitorFingerprint(input: MetaVisitorThrottleInput) {
  if (input.fbp) return hashPart(`fbp:${input.fbp}`);
  if (input.fbc) return hashPart(`fbc:${input.fbc}`);
  return hashPart(
    `fallback:${input.clientIp ?? "unknown"}:${input.userAgent ?? "unknown"}`
  );
}

function hashPart(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
