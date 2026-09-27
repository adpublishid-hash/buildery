import { describe, expect, it } from "vitest";

import {
  normalizeCity,
  normalizeCountry,
  normalizeEmail,
  normalizePhone,
  normalizePostalCode,
  splitName,
  validClickId,
  validFacebookCookie,
} from "@/lib/ad-match";
import { readAdClickCookies, readAttributionFromUrl } from "@/lib/analytics-visitor";

describe("normalizePhone", () => {
  it.each([
    ["0812-3456-7890", "6281234567890"],
    ["081234567890", "6281234567890"],
    ["81234567890", "6281234567890"],
    ["+62 812 3456 7890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["0062 812 3456 7890", "6281234567890"],
    ["+1 (213) 373-4253", "12133734253"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([null, undefined, "", "abc", "12345", "1234567890123456"])(
    "rejects unusable input %s",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    }
  );
});

describe("other identity fields", () => {
  it("normalises email, name, city, postal code and country", () => {
    expect(normalizeEmail("  Buyer@Example.COM ")).toBe("buyer@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeCity("Kota Bandung")).toBe("bandung");
    expect(normalizeCity("Kabupaten Sleman")).toBe("sleman");
    expect(normalizeCity("Jakarta Selatan")).toBe("jakartaselatan");
    expect(normalizePostalCode("40 111")).toBe("40111");
    expect(normalizeCountry("ID")).toBe("id");
    expect(normalizeCountry("Indonesia")).toBeNull();
    expect(splitName(" Wahib  Nur Rohman ")).toEqual({
      firstName: "Wahib",
      lastName: "Nur Rohman",
    });
  });

  it("accepts only well-formed pixel cookies and click ids", () => {
    expect(validFacebookCookie("fb.1.1700000000000.AbC-123")).toBe(
      "fb.1.1700000000000.AbC-123"
    );
    expect(validFacebookCookie("fb.1.x.y")).toBeNull();
    expect(validFacebookCookie("evil value")).toBeNull();
    expect(validClickId("E.C.P.abc-123_~")).toBe("E.C.P.abc-123_~");
    expect(validClickId("has space")).toBeNull();
    expect(validClickId("x".repeat(501))).toBeNull();
  });
});

describe("ad click cookies from the landing URL", () => {
  const now = 1_700_000_000_000;

  it("formats fbclid the way Meta's pixel writes _fbc, and keeps ttclid", () => {
    const url = new URL("https://shop.example/p/1?fbclid=IwAR123&ttclid=E.C.P.xyz");
    expect(readAdClickCookies(url, {}, now)).toEqual({
      fbc: "fb.1.1700000000000.IwAR123",
      ttclid: "E.C.P.xyz",
    });
  });

  it("does not reset the click time when the same link is opened again", () => {
    const url = new URL("https://shop.example/?fbclid=IwAR123&ttclid=abc");
    expect(
      readAdClickCookies(url, { fbc: "fb.1.1600000000000.IwAR123", ttclid: "abc" }, now)
    ).toEqual({ fbc: null, ttclid: null });
  });

  it("replaces an older click with a new one", () => {
    const url = new URL("https://shop.example/?fbclid=NEW");
    expect(
      readAdClickCookies(url, { fbc: "fb.1.1600000000000.OLD" }, now).fbc
    ).toBe("fb.1.1700000000000.NEW");
  });

  it("ignores malformed click ids", () => {
    const url = new URL("https://shop.example/?fbclid=%3Cscript%3E&ttclid=a%20b");
    expect(readAdClickCookies(url, {}, now)).toEqual({ fbc: null, ttclid: null });
  });

  it("credits a TikTok ad click as tiktok / cpc", () => {
    expect(
      readAttributionFromUrl(new URL("https://shop.example/?ttclid=abc"))
    ).toMatchObject({ utmSource: "tiktok", utmMedium: "cpc" });
  });
});
