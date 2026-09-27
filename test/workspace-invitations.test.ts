import { describe, expect, it } from "vitest";

import { createWorkspaceInvitationToken, hashWorkspaceInvitationToken } from "@/lib/workspace-invitations";

describe("workspace invitation tokens", () => {
  it("returns a raw token separately from its persisted hash", () => {
    const token = createWorkspaceInvitationToken();
    expect(token.raw).not.toBe(token.hash);
    expect(token.hash).toBe(hashWorkspaceInvitationToken(token.raw));
    expect(token.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rotates to a different token for each invitation delivery", () => {
    expect(createWorkspaceInvitationToken().raw).not.toBe(createWorkspaceInvitationToken().raw);
  });
});
