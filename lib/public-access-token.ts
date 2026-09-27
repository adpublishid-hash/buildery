import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 60 * 60 * 24;

type AccessScope = "order" | "payment";

type AccessPayload = {
  scope: AccessScope;
  resourceId: string;
  exp: number;
};

function secret() {
  const value = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required in production.");
  }
  return value || "buildery-local-access-secret";
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function issuePublicAccessToken(
  scope: AccessScope,
  resourceId: string,
  ttlSeconds = TOKEN_TTL_SECONDS
) {
  const payload: AccessPayload = {
    scope,
    resourceId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyPublicAccessToken(
  token: string | null | undefined,
  scope: AccessScope,
  resourceId: string
) {
  if (!token) return false;
  const [body, signature] = token.split(".");
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
    ) as Partial<AccessPayload>;
    return (
      payload.scope === scope &&
      payload.resourceId === resourceId &&
      typeof payload.exp === "number" &&
      payload.exp >= Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
