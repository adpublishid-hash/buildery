import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";

const TOKEN_TTL_SECONDS = 10 * 60;

type EventAuthorization = {
  workspaceId: string;
  eventName: MetaStandardEventName;
  eventId: string;
  dataHash: string;
  exp: number;
};

function secret() {
  const value = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required in production.");
  }
  return value || "buildery-local-meta-secret";
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

function dataHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value ?? null)))
    .digest("base64url");
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function issueMetaEventAuthorization(input: {
  workspaceId: string;
  eventName: MetaStandardEventName;
  customData?: MetaCustomData;
}) {
  const payload: EventAuthorization = {
    workspaceId: input.workspaceId,
    eventName: input.eventName,
    eventId: randomUUID(),
    dataHash: dataHash(input.customData),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { eventId: payload.eventId, token: `${body}.${sign(body)}` };
}

export function verifyMetaEventAuthorization(input: {
  token: unknown;
  workspaceId: string;
  eventName: MetaStandardEventName;
  eventId: string;
  customData: unknown;
}) {
  if (typeof input.token !== "string") return false;
  const [body, signature] = input.token.split(".");
  if (!body || !signature) return false;
  const expected = sign(body);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as Partial<EventAuthorization>;
    return (
      payload.workspaceId === input.workspaceId &&
      payload.eventName === input.eventName &&
      payload.eventId === input.eventId &&
      payload.dataHash === dataHash(input.customData) &&
      typeof payload.exp === "number" &&
      payload.exp >= Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
