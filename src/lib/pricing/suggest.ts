// The suggested price of a booking (ADR 0029). Pure: the price list is loaded elsewhere.

/** The longest stay the list has a row for; longer stays are priced in blocks of it. */
export const LIST_DAYS = 31;

export interface PriceRow {
  /** One piece (umbrella, sunbed or deckchair), in cents. */
  single: number;
  /** An umbrella and 2 pieces, in cents. */
  bundle: number;
}

export interface PriceList {
  /** Rows for 1 to 31 days. */
  days: Map<number, PriceRow>;
  /** The season row (Stagionale): a cap on every stay. */
  season: PriceRow | null;
}

export type Column = keyof PriceRow;

export interface Suggestion {
  totalCents: number;
  pieces: number;
  days: number;
  bundles: number;
  bundleCents: number;
  singles: number;
  singleCents: number;
  /** Against every piece at the one-day price; 0 when there is none to compare with. */
  discountCents: number;
  /** Whole percent, rounded down. */
  discountPercent: number;
}

/**
 * One column's price for a stay: whole 31-day blocks at the 31-day price plus the remaining days,
 * never above the season row. Null when a row it needs is missing.
 */
export function columnPrice(list: PriceList, column: Column, days: number): number | null {
  if (!Number.isInteger(days) || days < 1) return null;
  const blocks = Math.floor(days / LIST_DAYS);
  const rest = days % LIST_DAYS;
  const block = blocks > 0 ? list.days.get(LIST_DAYS)?.[column] : 0;
  const remainder = rest > 0 ? list.days.get(rest)?.[column] : 0;
  if (block === undefined || remainder === undefined) return null;
  const price = blocks * block + remainder;
  return list.season ? Math.min(price, list.season[column]) : price;
}

function discount(list: PriceList, pieces: number, days: number, total: number) {
  const oneDay = list.days.get(1)?.single;
  const baseline = oneDay === undefined ? 0 : pieces * days * oneDay;
  if (baseline <= total) return { discountCents: 0, discountPercent: 0 };
  const discountCents = baseline - total;
  return { discountCents, discountPercent: Math.floor((discountCents * 100) / baseline) };
}

/** Every 3 pieces at the bundle price, the rest at the single price. Null if it can't be priced. */
export function suggestPrice(list: PriceList, pieces: number, days: number): Suggestion | null {
  const bundles = Math.floor(pieces / 3);
  const singles = pieces % 3;
  const bundleCents = bundles > 0 ? columnPrice(list, "bundle", days) : 0;
  const singleCents = singles > 0 ? columnPrice(list, "single", days) : 0;
  if (bundleCents === null || singleCents === null || days < 1) return null;
  const totalCents = bundles * bundleCents + singles * singleCents;
  return {
    totalCents,
    pieces,
    days,
    bundles,
    bundleCents,
    singles,
    singleCents,
    ...discount(list, pieces, days, totalCents),
  };
}

export interface PricedSpot {
  kind: "umbrella" | "sunbed";
  sunbeds: number;
}

/** Every umbrella, sunbed and deckchair is one piece; a standalone sunbed spot is one. */
export function piecesOf(spots: PricedSpot[], deckchairs: number): number {
  const onSpots = spots.reduce(
    (sum, s) => sum + (s.kind === "umbrella" ? 1 + s.sunbeds : Math.max(1, s.sunbeds)),
    0,
  );
  return onSpots + deckchairs;
}

/** Who ticked a booking paid, when, and the suggested price at that moment. */
export interface PaidMark {
  /** ISO timestamp (UTC). */
  at: string;
  byName: string;
  suggestedCents: number | null;
}

export interface BookingPrice {
  /** Null when the booking can't be priced (no season or a missing row). */
  suggestion: Suggestion | null;
  paid: PaidMark | null;
}

/** True when the booking was ticked paid at a different suggested price than it has now. */
export function priceChangedSincePaid(price: BookingPrice): boolean {
  if (!price.paid) return false;
  return (price.suggestion?.totalCents ?? null) !== price.paid.suggestedCents;
}
