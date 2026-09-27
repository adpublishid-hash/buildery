import { describe, expect, it } from "vitest";

import {
  metaContentFingerprint,
  metaVisitorFingerprint,
} from "@/lib/meta-view-content-throttle";

describe("Meta ViewContent throttle", () => {
  it("uses content_ids as the content fingerprint", () => {
    const a = metaContentFingerprint({
      content_ids: ["product_1"],
      contents: [{ id: "ignored" }],
    });
    const b = metaContentFingerprint({ content_ids: ["product_1"] });
    const c = metaContentFingerprint({ content_ids: ["product_2"] });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("falls back to contents ids when content_ids are missing", () => {
    expect(
      metaContentFingerprint({ contents: [{ id: "course_1", quantity: 1 }] })
    ).toBe(metaContentFingerprint({ content_ids: ["course_1"] }));
  });

  it("skips throttling when no content identity exists", () => {
    expect(metaContentFingerprint({ content_name: "Catalog" })).toBeNull();
  });

  it("prefers Meta browser cookies for visitor fingerprinting", () => {
    const byFbp = metaVisitorFingerprint({
      fbp: "fb.1.1.abc",
      clientIp: "203.0.113.10",
      userAgent: "A",
    });
    const sameFbpDifferentNetwork = metaVisitorFingerprint({
      fbp: "fb.1.1.abc",
      clientIp: "203.0.113.11",
      userAgent: "B",
    });
    const differentCookie = metaVisitorFingerprint({
      fbp: "fb.1.1.xyz",
      clientIp: "203.0.113.10",
      userAgent: "A",
    });

    expect(byFbp).toBe(sameFbpDifferentNetwork);
    expect(byFbp).not.toBe(differentCookie);
  });
});
