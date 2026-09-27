import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByIp: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    blogPost: { findUnique: db.findUnique },
    blogPostEvent: { create: db.create },
  },
}));

import { POST } from "@/app/api/blog/events/route";

function request(body: unknown) {
  return new NextRequest("https://example.test/api/blog/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "bd_vid=visitor-1",
    },
    body: JSON.stringify(body),
  });
}

describe("blog engagement events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects events for a post outside the supplied workspace", async () => {
    db.findUnique.mockResolvedValue({
      workspaceId: "workspace-2",
      status: "PUBLISHED",
      publishedVersion: 1,
    });
    const response = await POST(
      request({ workspaceId: "workspace-1", postId: "post-1", type: "VIEW" })
    );
    expect(response.status).toBe(400);
    expect(db.create).not.toHaveBeenCalled();
  });

  it("records supported events only for a visible published snapshot", async () => {
    db.findUnique.mockResolvedValue({
      workspaceId: "workspace-1",
      status: "SCHEDULED",
      publishedVersion: 2,
    });
    db.create.mockResolvedValue({ id: "event-1" });
    const response = await POST(
      request({
        workspaceId: "workspace-1",
        postId: "post-1",
        type: "READ_COMPLETE",
        path: "/blog/article",
      })
    );
    expect(response.status).toBe(200);
    expect(db.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        postId: "post-1",
        type: "READ_COMPLETE",
        visitorId: "visitor-1",
      }),
    });
  });
});
