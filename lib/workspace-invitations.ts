import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function createWorkspaceInvitationToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashWorkspaceInvitationToken(raw) };
}

export function hashWorkspaceInvitationToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}
