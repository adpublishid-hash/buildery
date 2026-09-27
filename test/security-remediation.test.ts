import { describe, expect, it, vi } from "vitest";

import { detectFormUploadType } from "@/lib/form-upload";
import {
  issueMetaEventAuthorization,
  verifyMetaEventAuthorization,
} from "@/lib/meta-event-auth";
import {
  issuePublicAccessToken,
  verifyPublicAccessToken,
} from "@/lib/public-access-token";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { safeCallbackUrl } from "@/lib/safe-redirect";

describe("safeCallbackUrl", () => {
  const fallback = "/site/demo/member/account";

  it("accepts same-origin relative paths", () => {
    expect(safeCallbackUrl("/site/demo/courses/a?lesson=1", fallback)).toBe(
      "/site/demo/courses/a?lesson=1"
    );
  });

  it.each([
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "javascript:alert(1)",
  ])("rejects unsafe callback %s", (value) => {
    expect(safeCallbackUrl(value, fallback)).toBe(fallback);
  });
});

describe("public access tokens", () => {
  it("binds a token to its scope and resource", () => {
    const token = issuePublicAccessToken("payment", "pay_1");
    expect(verifyPublicAccessToken(token, "payment", "pay_1")).toBe(true);
    expect(verifyPublicAccessToken(token, "payment", "pay_2")).toBe(false);
    expect(verifyPublicAccessToken(token, "order", "pay_1")).toBe(false);
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));
    const token = issuePublicAccessToken("order", "ord_1", 1);
    vi.advanceTimersByTime(2_000);
    expect(verifyPublicAccessToken(token, "order", "ord_1")).toBe(false);
    vi.useRealTimers();
  });
});

describe("Meta event authorization", () => {
  it("rejects changes to event payloads", () => {
    const customData = { content_ids: ["product_1"], value: 25_000 };
    const auth = issueMetaEventAuthorization({
      workspaceId: "workspace_1",
      eventName: "ViewContent",
      customData,
    });
    expect(
      verifyMetaEventAuthorization({
        token: auth.token,
        workspaceId: "workspace_1",
        eventName: "ViewContent",
        eventId: auth.eventId,
        customData,
      })
    ).toBe(true);
    expect(
      verifyMetaEventAuthorization({
        token: auth.token,
        workspaceId: "workspace_1",
        eventName: "Purchase",
        eventId: auth.eventId,
        customData: { ...customData, value: 1 },
      })
    ).toBe(false);
  });
});

describe("rich HTML sanitizer", () => {
  it("removes active content and scriptable URLs", () => {
    const clean = sanitizeRichHtml(
      '<p>Safe</p><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><svg onload=alert(1)></svg><iframe src="https://bad.example"></iframe>'
    );
    expect(clean).toContain("<p>Safe</p>");
    expect(clean).not.toMatch(/onerror|onload|javascript:|<svg|<iframe/i);
  });

  it("keeps safe formatting and HTTPS links", () => {
    expect(
      sanitizeRichHtml(
        '<p><strong>Hello</strong> <a href="https://example.com" target="_blank">link</a></p>'
      )
    ).toContain('rel="noopener noreferrer"');
  });
});

describe("form upload detection", () => {
  it("uses magic bytes rather than the submitted filename or MIME", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n");
    expect(detectFormUploadType(pdf)).toEqual({
      mimeType: "application/pdf",
      extension: "pdf",
    });

    const html = new TextEncoder().encode("<script>alert(1)</script>");
    expect(detectFormUploadType(html)).toBeNull();
  });
});
