import { describe, expect, it } from "vitest";
import {
  columnPrice,
  piecesOf,
  priceChangedSincePaid,
  suggestPrice,
  type PriceList,
} from "@/lib/pricing/suggest";

// Made-up prices in cents, shaped like a club list: per-day price falls with the length of stay,
// the bundle is a little under three singles on some rows, and a season row caps long stays.
const SINGLE = [
  10, 20, 30, 40, 50, 60, 68, 77, 86, 95, 104, 114, 122, 131, 140, 147, 154, 160, 168, 175, 182,
  190, 195, 200, 204, 208, 212, 216, 222, 225, 230,
];
const BUNDLE_ODD: Record<number, number> = { 8: 230, 16: 440 };

function list(overrides: Partial<PriceList> = {}): PriceList {
  const days = new Map(
    SINGLE.map((euros, i) => {
      const d = i + 1;
      return [d, { single: euros * 100, bundle: (BUNDLE_ODD[d] ?? euros * 3) * 100 }];
    }),
  );
  return { days, season: { single: 85_000, bundle: 255_000 }, ...overrides };
}

describe("columnPrice", () => {
  it.each([
    [1, 1000],
    [3, 3000],
    [31, 23_000],
    [32, 23_000 + 1000],
    [62, 46_000],
    [63, 46_000 + 1000],
  ])("prices %d days of one piece", (days, cents) => {
    expect(columnPrice(list(), "single", days)).toBe(cents);
  });

  it("never goes above the season row", () => {
    // 120 days: 3 × 230 + 212 = 902 euros, capped at 850.
    expect(columnPrice(list(), "single", 120)).toBe(85_000);
    expect(columnPrice(list(), "bundle", 120)).toBe(255_000);
  });

  it("is not capped when there is no season row", () => {
    expect(columnPrice(list({ season: null }), "single", 120)).toBe(90_200);
  });

  it("is null for a missing row, including row 31 for longer stays", () => {
    const days = list().days;
    days.delete(5);
    expect(columnPrice({ days, season: null }, "single", 5)).toBeNull();
    days.delete(31);
    expect(columnPrice({ days, season: null }, "single", 33)).toBeNull();
  });

  it("is null for no days", () => {
    expect(columnPrice(list(), "single", 0)).toBeNull();
  });
});

describe("suggestPrice", () => {
  it("prices an umbrella with 3 sunbeds for 8 days as one bundle and one piece", () => {
    const s = suggestPrice(list(), 4, 8);
    expect(s).toMatchObject({
      totalCents: 30_700,
      bundles: 1,
      bundleCents: 23_000,
      singles: 1,
      singleCents: 7700,
      discountCents: 1300,
      discountPercent: 4,
    });
  });

  it.each([
    [0, 0],
    [1, 14_700],
    [2, 29_400],
    [3, 44_000],
    [4, 58_700],
    [5, 73_400],
    [6, 88_000],
  ])("prices %d pieces for 16 days", (pieces, cents) => {
    expect(suggestPrice(list(), pieces, 16)?.totalCents).toBe(cents);
  });

  it("caps a long season pass at the season row and shows the discount", () => {
    const s = suggestPrice(list(), 3, 120);
    expect(s?.totalCents).toBe(255_000);
    expect(s?.discountCents).toBe(3 * 120 * 1000 - 255_000);
    expect(s?.discountPercent).toBe(29);
  });

  it("shows no discount for one day", () => {
    expect(suggestPrice(list(), 3, 1)).toMatchObject({ discountCents: 0, discountPercent: 0 });
  });

  it("shows no discount without a one-day row", () => {
    const days = list().days;
    days.delete(1);
    expect(suggestPrice({ days, season: null }, 3, 8)).toMatchObject({
      totalCents: 23_000,
      discountCents: 0,
      discountPercent: 0,
    });
  });

  it("is null when a row it needs is missing", () => {
    const days = list().days;
    days.delete(8);
    expect(suggestPrice({ days, season: null }, 4, 8)).toBeNull();
  });

  it("needs only the single column for fewer than 3 pieces", () => {
    const days = new Map([[2, { single: 2000, bundle: 0 }]]);
    expect(suggestPrice({ days, season: null }, 2, 2)?.totalCents).toBe(4000);
  });
});

describe("piecesOf", () => {
  it("counts each umbrella, sunbed and deckchair as one piece", () => {
    expect(piecesOf([{ kind: "umbrella", sunbeds: 3 }], 0)).toBe(4);
    expect(
      piecesOf(
        [
          { kind: "umbrella", sunbeds: 2 },
          { kind: "umbrella", sunbeds: 0 },
        ],
        2,
      ),
    ).toBe(6);
  });

  it("counts a standalone sunbed spot once", () => {
    expect(piecesOf([{ kind: "sunbed", sunbeds: 1 }], 0)).toBe(1);
    expect(piecesOf([{ kind: "sunbed", sunbeds: 0 }], 0)).toBe(1);
  });
});

describe("priceChangedSincePaid", () => {
  const suggestion = suggestPrice(list(), 4, 8);
  const paid = { at: "2027-07-10T09:00:00Z", byName: "Anna", suggestedCents: 30_700 };

  it("is false when unpaid or paid at today's price", () => {
    expect(priceChangedSincePaid({ suggestion, paid: null })).toBe(false);
    expect(priceChangedSincePaid({ suggestion, paid })).toBe(false);
  });

  it("is true when the price moved or can no longer be worked out", () => {
    expect(priceChangedSincePaid({ suggestion, paid: { ...paid, suggestedCents: 23_000 } })).toBe(
      true,
    );
    expect(priceChangedSincePaid({ suggestion: null, paid })).toBe(true);
  });
});
