import { describe, expect, it } from "vitest";

import {
  addMonths,
  buildInvoiceAmounts,
  dueReminderStage,
  formatInvoiceNumber,
  getMonthlyPlanPricing,
  getProratedCredit,
  isSubscriptionEntitled,
  nextPeriodStart,
  pickUniqueCode,
  MAX_UNIQUE_CODE,
  MIN_UNIQUE_CODE,
} from "@/lib/billing-pricing";

describe("getMonthlyPlanPricing", () => {
  it("returns Starter promotional pricing", () => {
    expect(
      getMonthlyPlanPricing({
        monthlyPrice: 99_000,
        compareAtMonthlyPrice: 120_000,
      })
    ).toEqual({
      payablePrice: 99_000,
      listPrice: 120_000,
      savings: 21_000,
      discountPercent: 18,
      hasDiscount: true,
    });
  });

  it("returns Pro promotional pricing", () => {
    expect(
      getMonthlyPlanPricing({
        monthlyPrice: 299_000,
        compareAtMonthlyPrice: 350_000,
      })
    ).toMatchObject({ payablePrice: 299_000, savings: 51_000, hasDiscount: true });
  });

  it("ignores an invalid comparison price", () => {
    expect(
      getMonthlyPlanPricing({ monthlyPrice: 99_000, compareAtMonthlyPrice: 90_000 })
    ).toEqual({
      payablePrice: 99_000,
      listPrice: 99_000,
      savings: 0,
      discountPercent: 0,
      hasDiscount: false,
    });
  });
});

describe("getProratedCredit", () => {
  const now = new Date("2026-09-18T00:00:00Z");

  it("credits the unused days of the running plan", () => {
    // Starter 99k, 15 hari tersisa dari periode 30 hari.
    expect(
      getProratedCredit({
        currentMonthlyPrice: 99_000,
        currentPeriodEnd: new Date("2026-10-03T00:00:00Z"),
        now,
      })
    ).toBe(49_500);
  });

  it("credits nothing once the period has already ended", () => {
    expect(
      getProratedCredit({
        currentMonthlyPrice: 99_000,
        currentPeriodEnd: new Date("2026-09-17T00:00:00Z"),
        now,
      })
    ).toBe(0);
  });

  it("credits nothing for a free plan or an open-ended subscription", () => {
    expect(
      getProratedCredit({
        currentMonthlyPrice: 0,
        currentPeriodEnd: new Date("2026-10-18T00:00:00Z"),
        now,
      })
    ).toBe(0);
    expect(
      getProratedCredit({
        currentMonthlyPrice: 99_000,
        currentPeriodEnd: null,
        now,
      })
    ).toBe(0);
  });

  it("never credits more than one period was worth", () => {
    expect(
      getProratedCredit({
        currentMonthlyPrice: 99_000,
        currentPeriodEnd: new Date("2027-09-18T00:00:00Z"),
        now,
      })
    ).toBe(99_000);
  });
});

describe("buildInvoiceAmounts", () => {
  it("adds the unique code on top of the promo price", () => {
    expect(
      buildInvoiceAmounts({
        listPrice: 350_000,
        promoPrice: 299_000,
        uniqueCode: 421,
      })
    ).toMatchObject({
      totalAmount: 299_421,
      savings: 51_000,
      discountPercent: 15,
      hasDiscount: true,
    });
  });

  it("subtracts the upgrade credit before the unique code", () => {
    expect(
      buildInvoiceAmounts({
        listPrice: 350_000,
        promoPrice: 299_000,
        proratedCredit: 49_500,
        uniqueCode: 105,
      }).totalAmount
    ).toBe(249_605);
  });

  it("still bills the unique code when the credit covers the whole plan", () => {
    // Transfer Rp 0 tidak bisa dicocokkan admin.
    expect(
      buildInvoiceAmounts({
        listPrice: 120_000,
        promoPrice: 99_000,
        proratedCredit: 500_000,
        uniqueCode: 333,
      })
    ).toMatchObject({ proratedCredit: 99_000, totalAmount: 333 });
  });
});

describe("pickUniqueCode", () => {
  it("stays inside the configured range", () => {
    const code = pickUniqueCode({ payableAmount: 99_000, takenAmounts: [] })!;
    expect(code).toBeGreaterThanOrEqual(MIN_UNIQUE_CODE);
    expect(code).toBeLessThanOrEqual(MAX_UNIQUE_CODE);
  });

  it("never reissues a total another open invoice already holds", () => {
    const taken = [99_101, 99_102, 99_103];
    const code = pickUniqueCode({
      payableAmount: 99_000,
      takenAmounts: taken,
      random: () => 0,
    });
    expect(code).toBe(104);
  });

  it("returns null when the whole range is exhausted", () => {
    const taken: number[] = [];
    for (let c = MIN_UNIQUE_CODE; c <= MAX_UNIQUE_CODE; c++) taken.push(99_000 + c);
    expect(
      pickUniqueCode({ payableAmount: 99_000, takenAmounts: taken })
    ).toBeNull();
  });
});

describe("formatInvoiceNumber", () => {
  it("is readable and sortable", () => {
    expect(
      formatInvoiceNumber({
        tier: "PRO",
        sequence: 7,
        now: new Date("2026-09-18T10:00:00Z"),
      })
    ).toBe("INV-PRO-20260918-0007");
  });
});

describe("addMonths and nextPeriodStart", () => {
  it("clamps to the last day of a shorter month", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    );
  });

  it("stacks a renewal on top of the remaining period", () => {
    const periodEnd = new Date("2026-10-01T00:00:00Z");
    const now = new Date("2026-09-18T00:00:00Z");
    expect(nextPeriodStart(periodEnd, now)).toEqual(periodEnd);
  });

  it("starts from now when the period has already lapsed", () => {
    const now = new Date("2026-09-18T00:00:00Z");
    expect(nextPeriodStart(new Date("2026-09-01T00:00:00Z"), now)).toEqual(now);
  });
});

describe("dueReminderStage", () => {
  const now = new Date("2026-09-18T00:00:00Z");

  it("sends the 7-day reminder first", () => {
    expect(
      dueReminderStage({
        periodEnd: new Date("2026-09-24T00:00:00Z"),
        lastStage: 0,
        now,
      })
    ).toBe(7);
  });

  it("does not repeat a stage already sent", () => {
    expect(
      dueReminderStage({
        periodEnd: new Date("2026-09-24T00:00:00Z"),
        lastStage: 7,
        now,
      })
    ).toBeNull();
  });

  it("moves on to the next stage as the date closes in", () => {
    expect(
      dueReminderStage({
        periodEnd: new Date("2026-09-20T00:00:00Z"),
        lastStage: 7,
        now,
      })
    ).toBe(3);
  });

  it("sends nothing once the period has passed", () => {
    expect(
      dueReminderStage({
        periodEnd: new Date("2026-09-17T00:00:00Z"),
        lastStage: 3,
        now,
      })
    ).toBeNull();
  });
});

describe("isSubscriptionEntitled", () => {
  const now = new Date("2026-09-18T00:00:00Z");

  it("entitles an active subscription inside its period", () => {
    expect(
      isSubscriptionEntitled(
        {
          status: "ACTIVE",
          currentPeriodEnd: new Date("2026-10-18T00:00:00Z"),
          graceUntil: null,
        },
        now
      )
    ).toBe(true);
  });

  it("stops entitling an active subscription whose period has lapsed", () => {
    // Inti bug lama: status ACTIVE saja memberi akses Pro selamanya.
    expect(
      isSubscriptionEntitled(
        {
          status: "ACTIVE",
          currentPeriodEnd: new Date("2026-03-18T00:00:00Z"),
          graceUntil: null,
        },
        now
      )
    ).toBe(false);
  });

  it("keeps entitling a past-due subscription inside its grace window", () => {
    expect(
      isSubscriptionEntitled(
        {
          status: "PAST_DUE",
          currentPeriodEnd: new Date("2026-09-17T00:00:00Z"),
          graceUntil: new Date("2026-09-20T00:00:00Z"),
          },
        now
      )
    ).toBe(true);
  });

  it("drops a past-due subscription once the grace window closes", () => {
    expect(
      isSubscriptionEntitled(
        {
          status: "PAST_DUE",
          currentPeriodEnd: new Date("2026-09-10T00:00:00Z"),
          graceUntil: new Date("2026-09-13T00:00:00Z"),
        },
        now
      )
    ).toBe(false);
  });

  it("treats a missing period end as an admin-granted plan without expiry", () => {
    expect(
      isSubscriptionEntitled(
        { status: "ACTIVE", currentPeriodEnd: null, graceUntil: null },
        now
      )
    ).toBe(true);
  });

  it("never entitles a cancelled or expired subscription", () => {
    for (const status of ["CANCELLED", "EXPIRED"]) {
      expect(
        isSubscriptionEntitled(
          {
            status,
            currentPeriodEnd: new Date("2026-10-18T00:00:00Z"),
            graceUntil: null,
          },
          now
        )
      ).toBe(false);
    }
  });
});
