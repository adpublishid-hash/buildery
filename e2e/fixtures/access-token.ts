import { createHmac } from "node:crypto";

/**
 * Mints the same signed order token the app issues at checkout, so specs can
 * hand the return page a token that is deliberately expired, forged, or for
 * a different order. Kept in step with `lib/public-access-token.ts`, which
 * cannot be imported here — it is tagged "server-only".
 */
export function issueTestAccessToken(
  scope: "order" | "payment",
  resourceId: string,
  ttlSeconds: number
) {
  const secret =
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "buildery-local-access-secret";
  const payload = {
    scope,
    resourceId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}
