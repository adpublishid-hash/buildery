import { describe, expect, it } from "vitest";

import { codEligibility, isCodPayment, COD_PROVIDER } from "@/lib/cod";

/**
 * Cash on delivery is the one mode that is not a promise to pay now: the money
 * arrives with the courier. So it needs a courier — a cart of downloads, or a
 * pickup at the shop, has nothing for one to collect against.
 */

const base = {
  codEnabled: true,
  codFee: 5_000,
  codMinimum: 50_000,
  codMaximum: 2_000_000,
};

const delivery = {
  orderValue: 150_000,
  requiresShipping: true,
  shippingMethodType: "AUTOMATIC",
};

describe("codEligibility", () => {
  it("allows a delivered order inside the limits, with its fee", () => {
    expect(codEligibility(base, delivery)).toEqual({ ok: true, fee: 5_000 });
  });

  it("refuses it when the store has COD switched off", () => {
    expect(codEligibility({ ...base, codEnabled: false }, delivery).ok).toBe(false);
  });

  it("refuses a cart with nothing to deliver", () => {
    const result = codEligibility(base, { ...delivery, requiresShipping: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/fisik/i);
  });

  it("refuses store pickup — there is no courier to pay", () => {
    const result = codEligibility(base, {
      ...delivery,
      shippingMethodType: "PICKUP",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ambil di lokasi/i);
  });

  it("honours the minimum and maximum order value", () => {
    expect(codEligibility(base, { ...delivery, orderValue: 49_999 }).ok).toBe(false);
    expect(codEligibility(base, { ...delivery, orderValue: 50_000 }).ok).toBe(true);
    expect(codEligibility(base, { ...delivery, orderValue: 2_000_001 }).ok).toBe(false);
  });

  it("treats a missing maximum as no ceiling", () => {
    expect(
      codEligibility(
        { ...base, codMaximum: null },
        { ...delivery, orderValue: 900_000_000 }
      ).ok
    ).toBe(true);
  });

  it("never returns a negative fee", () => {
    const result = codEligibility({ ...base, codFee: -1_000 }, delivery);
    expect(result).toEqual({ ok: true, fee: 0 });
  });
});

describe("isCodPayment", () => {
  it("recognises a COD payment and nothing else", () => {
    expect(isCodPayment(COD_PROVIDER)).toBe(true);
    expect(isCodPayment("midtrans")).toBe(false);
    expect(isCodPayment("manual:Transfer BCA")).toBe(false);
    expect(isCodPayment(null)).toBe(false);
  });
});
