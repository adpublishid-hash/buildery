import { describe, expect, it } from "vitest";

import {
  decodeAttribution,
  encodeAttribution,
  EMPTY_ATTRIBUTION,
  hasAttribution,
  mergeAttribution,
  readAttributionFromUrl,
} from "@/lib/analytics-visitor";

const url = (query: string) => new URL(`https://toko.landing.my.id/${query}`);

describe("readAttributionFromUrl", () => {
  it("reads the standard utm parameters", () => {
    expect(
      readAttributionFromUrl(
        url("?utm_source=instagram&utm_medium=cpc&utm_campaign=lebaran")
      )
    ).toMatchObject({
      utmSource: "instagram",
      utmMedium: "cpc",
      utmCampaign: "lebaran",
    });
  });

  it("treats an ad click id as a source", () => {
    // An ad click often arrives with only gclid; calling that "direct" would
    // credit the sale to nobody.
    expect(readAttributionFromUrl(url("?gclid=abc123"))).toMatchObject({
      utmSource: "google",
      utmMedium: "cpc",
    });
    expect(readAttributionFromUrl(url("?fbclid=xyz"))).toMatchObject({
      utmSource: "facebook",
    });
  });

  it("prefers explicit utm over a click id", () => {
    expect(
      readAttributionFromUrl(url("?utm_source=newsletter&fbclid=xyz"))
    ).toMatchObject({ utmSource: "newsletter" });
  });

  it("returns nothing for a plain visit", () => {
    expect(readAttributionFromUrl(url(""))).toEqual(EMPTY_ATTRIBUTION);
    expect(hasAttribution(EMPTY_ATTRIBUTION)).toBe(false);
  });

  it("trims and caps oversized values", () => {
    const long = "x".repeat(300);
    expect(
      readAttributionFromUrl(url(`?utm_source=%20${long}%20`)).utmSource?.length
    ).toBe(120);
  });
});

describe("attribution cookie round-trip", () => {
  it("survives encode then decode", () => {
    const attribution = readAttributionFromUrl(
      url("?utm_source=tiktok&utm_campaign=flash&utm_content=video1")
    );
    expect(decodeAttribution(encodeAttribution(attribution))).toEqual(
      attribution
    );
  });

  it("never throws on a corrupt cookie", () => {
    expect(decodeAttribution("not json")).toEqual(EMPTY_ATTRIBUTION);
    expect(decodeAttribution(undefined)).toEqual(EMPTY_ATTRIBUTION);
    expect(decodeAttribution("[1,2]")).toEqual(EMPTY_ATTRIBUTION);
  });
});

describe("mergeAttribution", () => {
  const first = readAttributionFromUrl(url("?utm_source=instagram"));
  const later = readAttributionFromUrl(url("?utm_source=retargeting"));

  it("keeps the first touch rather than the most recent", () => {
    // Last-click would hand every sale to whichever retargeting ad was shown
    // most recently, which is exactly the ad that needed the least credit.
    expect(mergeAttribution(first, later)).toEqual(first);
  });

  it("takes the incoming one when there was nothing before", () => {
    expect(mergeAttribution(EMPTY_ATTRIBUTION, later)).toEqual(later);
  });

  it("keeps what it has when the new visit carries nothing", () => {
    expect(mergeAttribution(first, EMPTY_ATTRIBUTION)).toEqual(first);
  });
});
