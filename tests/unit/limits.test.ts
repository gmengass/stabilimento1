import { describe, expect, it } from "vitest";
import { MAX_DECKCHAIRS_PER_UMBRELLA } from "@/lib/beach/limits";
import { MAX_SPOTS_PER_BOOKING } from "@/lib/booking/bookings";

describe("MAX_DECKCHAIRS_PER_UMBRELLA (ADR 0020)", () => {
  it("allows 2 deckchairs per umbrella", () => {
    expect(MAX_DECKCHAIRS_PER_UMBRELLA).toBe(2);
  });

  it("stays within the database backstop of 40 for the largest booking", () => {
    expect(MAX_DECKCHAIRS_PER_UMBRELLA * MAX_SPOTS_PER_BOOKING).toBeLessThanOrEqual(40);
  });
});
