import { describe, expect, it } from "vitest";
import { tileExtras } from "@/lib/booking/tile-extras";

const base = { includedSunbeds: 2, deckchairs: 0, showDeckchairs: true };

describe("tileExtras (ADR 0023)", () => {
  it("shows nothing for the default: the included sunbeds and no deckchair", () => {
    expect(tileExtras({ ...base, sunbeds: 2 })).toBeUndefined();
  });

  it("marks one extra sunbed +L and one sunbed fewer -L", () => {
    expect(tileExtras({ ...base, sunbeds: 3 })?.text).toBe("+L");
    expect(tileExtras({ ...base, sunbeds: 1 })?.text).toBe("-L");
  });

  it("puts a number on bigger differences", () => {
    expect(tileExtras({ ...base, sunbeds: 4 })?.text).toBe("+2L");
    expect(tileExtras({ ...base, sunbeds: 0 })?.text).toBe("-2L");
  });

  it("marks a deckchair +S, and several +nS", () => {
    expect(tileExtras({ ...base, sunbeds: 2, deckchairs: 1 })?.text).toBe("+S");
    expect(tileExtras({ ...base, sunbeds: 2, deckchairs: 2 })?.text).toBe("+2S");
  });

  it("joins both: -L +S and +L +S", () => {
    expect(tileExtras({ ...base, sunbeds: 1, deckchairs: 1 })?.text).toBe("-L +S");
    expect(tileExtras({ ...base, sunbeds: 3, deckchairs: 1 })?.text).toBe("+L +S");
  });

  it("leaves the booking's deckchairs to its first umbrella", () => {
    const other = { ...base, sunbeds: 2, deckchairs: 2, showDeckchairs: false };
    expect(tileExtras(other)).toBeUndefined();
    expect(tileExtras({ ...other, sunbeds: 3 })?.text).toBe("+L");
  });

  it("compares with the umbrella's own included sunbeds", () => {
    expect(tileExtras({ ...base, includedSunbeds: 3, sunbeds: 3 })).toBeUndefined();
    expect(tileExtras({ ...base, includedSunbeds: 3, sunbeds: 2 })?.text).toBe("-L");
  });

  it("returns the counts for the screen-reader label", () => {
    expect(tileExtras({ ...base, sunbeds: 4, deckchairs: 1 })).toMatchObject({
      sunbedDelta: 2,
      deckchairs: 1,
    });
  });
});
