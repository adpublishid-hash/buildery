import { describe, expect, it } from "vitest";

import {
  getPublicWorkspaceSlugFromHost,
  isPublicRootHost,
  isWorkspaceSlug,
  normalizeDomain,
  normalizeHost,
  normalizePublicPath,
  publicSiteRoutePath,
} from "@/lib/public-url";

/**
 * Host → workspace resolution decides which store a request is served as.
 * A bug here is a tenant-isolation bug: one store rendering another's pages.
 */

const DOMAIN = "landing.my.id";

describe("normalizeHost", () => {
  it("lowercases and strips the port", () => {
    expect(normalizeHost("Acme.Landing.My.Id:443")).toBe("acme.landing.my.id");
  });

  it("strips a trailing dot, which DNS treats as the same name", () => {
    expect(normalizeHost("acme.landing.my.id.")).toBe("acme.landing.my.id");
  });

  it("unwraps a bracketed IPv6 host with a port", () => {
    expect(normalizeHost("[::1]:3000")).toBe("::1");
  });

  it("returns empty for a missing host", () => {
    expect(normalizeHost(null)).toBe("");
  });
});

describe("normalizeDomain", () => {
  it("accepts a pasted URL and keeps only the domain", () => {
    expect(normalizeDomain(" https://Landing.My.Id/path ")).toBe("landing.my.id");
  });
});

describe("isWorkspaceSlug", () => {
  it("accepts ordinary slugs", () => {
    expect(isWorkspaceSlug("acme-studio")).toBe(true);
    expect(isWorkspaceSlug("a1")).toBe(true);
  });

  it("rejects reserved infrastructure names", () => {
    for (const reserved of ["www", "api", "admin", "mail", "app", "cdn"]) {
      expect(isWorkspaceSlug(reserved), reserved).toBe(false);
    }
  });

  it("rejects malformed slugs", () => {
    expect(isWorkspaceSlug("-acme")).toBe(false);
    expect(isWorkspaceSlug("acme-")).toBe(false);
    expect(isWorkspaceSlug("Acme")).toBe(false);
    expect(isWorkspaceSlug("ac_me")).toBe(false);
    expect(isWorkspaceSlug("")).toBe(false);
  });
});

describe("getPublicWorkspaceSlugFromHost", () => {
  it("resolves a store subdomain", () => {
    expect(getPublicWorkspaceSlugFromHost("acme.landing.my.id", DOMAIN)).toBe("acme");
  });

  it("resolves regardless of case, port, or trailing dot", () => {
    expect(getPublicWorkspaceSlugFromHost("ACME.Landing.my.id:443", DOMAIN)).toBe("acme");
    expect(getPublicWorkspaceSlugFromHost("acme.landing.my.id.", DOMAIN)).toBe("acme");
  });

  it("does not resolve the root domain as a store", () => {
    expect(getPublicWorkspaceSlugFromHost("landing.my.id", DOMAIN)).toBeNull();
  });

  it("does not resolve nested subdomains", () => {
    // Otherwise evil.acme.landing.my.id could be served as a store.
    expect(getPublicWorkspaceSlugFromHost("evil.acme.landing.my.id", DOMAIN)).toBeNull();
  });

  it("does not resolve a lookalike domain that merely ends in the same text", () => {
    // "acmelanding.my.id" ends with "landing.my.id" but is a different domain.
    expect(getPublicWorkspaceSlugFromHost("acmelanding.my.id", DOMAIN)).toBeNull();
  });

  it("does not resolve a different domain that contains ours", () => {
    expect(getPublicWorkspaceSlugFromHost("acme.landing.my.id.evil.com", DOMAIN)).toBeNull();
  });

  it("does not resolve reserved subdomains as stores", () => {
    expect(getPublicWorkspaceSlugFromHost("www.landing.my.id", DOMAIN)).toBeNull();
    expect(getPublicWorkspaceSlugFromHost("api.landing.my.id", DOMAIN)).toBeNull();
  });

  it("returns null for a missing host", () => {
    expect(getPublicWorkspaceSlugFromHost(null, DOMAIN)).toBeNull();
  });
});

describe("isPublicRootHost", () => {
  it("recognises the apex and www", () => {
    expect(isPublicRootHost("landing.my.id", DOMAIN)).toBe(true);
    expect(isPublicRootHost("www.landing.my.id:443", DOMAIN)).toBe(true);
  });

  it("does not treat a store subdomain as the root", () => {
    expect(isPublicRootHost("acme.landing.my.id", DOMAIN)).toBe(false);
  });
});

describe("public paths", () => {
  it("normalizes slashes and the empty path", () => {
    expect(normalizePublicPath("")).toBe("");
    expect(normalizePublicPath("/")).toBe("");
    expect(normalizePublicPath("//products")).toBe("/products");
    expect(normalizePublicPath("products")).toBe("/products");
  });

  it("builds the internal route path", () => {
    expect(publicSiteRoutePath("acme", "cart")).toBe("/site/acme/cart");
    expect(publicSiteRoutePath("acme")).toBe("/site/acme");
  });
});
