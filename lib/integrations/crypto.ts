import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for integration credentials at rest (AES-256-GCM).
 *
 * The key comes from INTEGRATION_SECRET_KEY, falling back to NEXTAUTH_SECRET,
 * and is domain-separated so the same secret never keys two different uses.
 */
function key() {
  const secret = process.env.INTEGRATION_SECRET_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("INTEGRATION_SECRET_KEY or NEXTAUTH_SECRET is required to store integration credentials.");
  }
  return createHash("sha256")
    .update("buildery:integration-secrets:v1:")
    .update(secret || "buildery-integration-development-secret")
    .digest();
}

export function encryptSecrets(values: Record<string, string>): string | null {
  const entries = Object.entries(values).filter(([, value]) => value !== "");
  if (!entries.length) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = JSON.stringify(Object.fromEntries(entries));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

/** Decrypts stored secrets. Returns {} for empty or unreadable values (e.g. after a key rotation). */
export function decryptSecrets(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) return {};
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plaintext) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

/** Unguessable id for webhook URLs. */
export function newWebhookKey() {
  return randomBytes(18).toString("base64url");
}
