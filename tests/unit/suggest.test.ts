import { describe, expect, it } from "vitest";
import {
  MAX_SUGGESTIONS,
  spreadSunbeds,
  suggestSpots,
  type SuggestResult,
  type Umbrella,
} from "@/lib/booking/suggest";

/** Umbrella 204 sits in line 2 at position 4. The spot id differs from the number on purpose. */
function u(number: number, maxSunbeds = 3): Umbrella {
  return {
    spotId: number * 10,
    number,
    line: Math.floor(number / 100),
    position: number % 100,
    maxSunbeds,
  };
}

const free = (...numbers: number[]) => numbers.map((n) => u(n));

/** Two full lines of five, like the default beach. */
const ALL_FREE = free(101, 102, 103, 104, 105, 201, 202, 203, 204, 205);

/** Each suggestion as [layout, umbrella numbers...] for compact assertions. */
function shape(result: SuggestResult): (string | number)[][] {
  if (!result.ok) throw new Error(`expected suggestions, got ${result.error}`);
  return result.suggestions.map((s) => [s.layout, ...s.spots.map((spot) => spot.number)]);
}

/** A fixed permutation (seeded LCG), so the test is deterministic. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("spreadSunbeds", () => {
  it.each([
    [[3, 3], 5, [3, 2]],
    [[2, 4], 5, [2, 3]],
    [[3, 3], 0, [0, 0]],
    [[3, 3, 3], 7, [3, 2, 2]],
    [[3, 3, 3], 9, [3, 3, 3]],
    [[1, 3, 3], 7, [1, 3, 3]],
    [[3, 3, 1], 7, [3, 3, 1]],
    [[3], 2, [2]],
  ])("spreads over %o, %i sunbeds → %o", (max, sunbeds, expected) => {
    expect(spreadSunbeds(max, sunbeds)).toEqual(expected);
  });

  it.each([
    [[1, 1], 3],
    [[3, 3], 7],
    [[1], 2],
  ])("is null when %o can't hold %i sunbeds", (max, sunbeds) => {
    expect(spreadSunbeds(max, sunbeds)).toBeNull();
  });
});

describe("suggestSpots", () => {
  it("caps suggestions at 5", () => {
    expect(MAX_SUGGESTIONS).toBe(5);
    const result = suggestSpots(ALL_FREE, 1, 1);
    expect(shape(result)).toHaveLength(MAX_SUGGESTIONS);
  });

  it("suggests the first adjacent pair nearest the sea, sunbeds spread left first", () => {
    const result = suggestSpots(ALL_FREE, 2, 5);
    if (!result.ok) throw new Error("expected suggestions");
    expect(result.suggestions[0]).toEqual({
      layout: "adjacent",
      spots: [
        { spotId: 1010, number: 101, sunbeds: 3 },
        { spotId: 1020, number: 102, sunbeds: 2 },
      ],
    });
    expect(shape(result)).toEqual([
      ["adjacent", 101, 102],
      ["adjacent", 102, 103],
      ["adjacent", 103, 104],
      ["adjacent", 104, 105],
      ["adjacent", 201, 202],
    ]);
  });

  it("with 102 taken, suggests 103+104 first, never 101+103", () => {
    const result = suggestSpots(free(101, 103, 104, 105, 201, 202, 203, 204, 205), 2, 4);
    expect(shape(result)).toEqual([
      ["adjacent", 103, 104],
      ["adjacent", 104, 105],
      ["adjacent", 201, 202],
      ["adjacent", 202, 203],
      ["adjacent", 203, 204],
    ]);
  });

  it("lists a same-line pair across a gap only after every adjacent pair", () => {
    expect(shape(suggestSpots(free(101, 103, 104, 105), 2, 2))).toEqual([
      ["adjacent", 103, 104],
      ["adjacent", 104, 105],
      ["sameLine", 101, 103],
    ]);
  });

  it("puts an adjacent pair in line 2 before any same-line pair in line 1", () => {
    expect(shape(suggestSpots(free(101, 103, 105, 201, 202), 2, 2))).toEqual([
      ["adjacent", 201, 202],
      ["sameLine", 101, 103],
      ["sameLine", 103, 105],
    ]);
  });

  it("treats a removed umbrella (position gap) like a taken one", () => {
    // Position 3 doesn't exist in line 1: 101, 102, 104, 105 hold no three in a row.
    expect(shape(suggestSpots(free(101, 102, 104, 105), 3, 3))).toEqual([
      ["sameLine", 101, 102, 104],
      ["sameLine", 102, 104, 105],
    ]);
  });

  it("without adjacent umbrellas, suggests the narrowest same-line group first", () => {
    expect(shape(suggestSpots(free(101, 104, 201, 203), 2, 2))).toEqual([
      ["sameLine", 201, 203],
      ["sameLine", 101, 104],
    ]);
  });

  it("breaks a same-line span tie by line, nearest the sea first", () => {
    expect(shape(suggestSpots(free(202, 204, 101, 103), 2, 2))).toEqual([
      ["sameLine", 101, 103],
      ["sameLine", 202, 204],
    ]);
  });

  it("with one free umbrella per line, splits across neighbouring lines", () => {
    const result = suggestSpots(free(103, 202, 301), 2, 4);
    if (!result.ok) throw new Error("expected suggestions");
    expect(result.suggestions[0]).toEqual({
      layout: "split",
      spots: [
        { spotId: 1030, number: 103, sunbeds: 2 },
        { spotId: 2020, number: 202, sunbeds: 2 },
      ],
    });
    expect(shape(result)).toEqual([
      ["split", 103, 202],
      ["split", 202, 301],
    ]);
  });

  it("in a split, takes the umbrella of the next line closest to those above it", () => {
    expect(shape(suggestSpots(free(104, 201, 205), 2, 2))).toEqual([
      ["sameLine", 201, 205],
      ["split", 104, 205],
    ]);
  });

  it("in a split, breaks a closeness tie by the lower position", () => {
    expect(shape(suggestSpots(free(103, 201, 205), 2, 2))).toEqual([
      ["sameLine", 201, 205],
      ["split", 103, 201],
    ]);
  });

  it("walks several lines for a split and prefers the one spanning fewer lines", () => {
    expect(shape(suggestSpots(free(101, 205, 301, 302, 306), 3, 3))).toEqual([
      ["sameLine", 301, 302, 306],
      ["split", 205, 302, 306],
      ["split", 101, 205, 302],
    ]);
  });

  it("offers a gapped pair in one line before a split across lines", () => {
    // Line 1 holds enough umbrellas, none side by side: no split starts there, so 101 + 201
    // (front and back) is never offered over 101 + 103.
    expect(shape(suggestSpots(free(101, 103, 201), 2, 0))).toEqual([["sameLine", 101, 103]]);
  });

  it("never offers a split for a single umbrella", () => {
    expect(shape(suggestSpots(free(305, 101, 203), 1, 1))).toEqual([
      ["adjacent", 101],
      ["adjacent", 203],
      ["adjacent", 305],
    ]);
  });

  it("with one umbrella, orders line by line, then by position", () => {
    expect(shape(suggestSpots(ALL_FREE, 1, 2))).toEqual([
      ["adjacent", 101],
      ["adjacent", 102],
      ["adjacent", 103],
      ["adjacent", 104],
      ["adjacent", 105],
    ]);
  });

  it("orders by position, not by umbrella number", () => {
    const renumbered: Umbrella[] = [
      { spotId: 1, number: 7, line: 1, position: 1, maxSunbeds: 3 },
      { spotId: 2, number: 3, line: 1, position: 2, maxSunbeds: 3 },
    ];
    expect(shape(suggestSpots(renumbered, 2, 2))).toEqual([["adjacent", 7, 3]]);
  });

  it("skips groups that can't hold the sunbeds", () => {
    const umbrellas = [u(101, 1), u(102, 1), u(201), u(202)];
    const result = suggestSpots(umbrellas, 2, 5);
    if (!result.ok) throw new Error("expected suggestions");
    expect(result.suggestions).toEqual([
      {
        layout: "adjacent",
        spots: [
          { spotId: 2010, number: 201, sunbeds: 3 },
          { spotId: 2020, number: 202, sunbeds: 2 },
        ],
      },
    ]);
  });

  it("skips a single umbrella too small for the sunbeds", () => {
    expect(shape(suggestSpots([u(101, 1), u(102)], 1, 2))).toEqual([["adjacent", 102]]);
  });

  it("reports noFit with the free count when there are fewer free umbrellas than asked", () => {
    expect(suggestSpots(free(101, 202), 3, 0)).toEqual({ ok: false, error: "noFit", free: 2 });
    expect(suggestSpots([], 1, 0)).toEqual({ ok: false, error: "noFit", free: 0 });
  });

  it("reports tooManySunbeds when enough umbrellas are free but none hold the sunbeds", () => {
    expect(suggestSpots(free(101, 102), 2, 7)).toEqual({ ok: false, error: "tooManySunbeds" });
    expect(suggestSpots([u(101, 1), u(205, 1)], 2, 3)).toEqual({
      ok: false,
      error: "tooManySunbeds",
    });
  });

  it("gives the same answer whatever order the free umbrellas come in", () => {
    const cases: [Umbrella[], number, number][] = [
      [ALL_FREE, 2, 5],
      [free(101, 103, 105, 201, 202), 2, 2],
      [free(101, 205, 301, 302, 306), 3, 3],
      [free(103, 201, 205), 2, 2],
    ];
    for (const [umbrellas, count, sunbeds] of cases) {
      const expected = suggestSpots(umbrellas, count, sunbeds);
      for (const seed of [1, 7, 42, 2027]) {
        expect(suggestSpots(shuffled(umbrellas, seed), count, sunbeds)).toEqual(expected);
      }
      expect(suggestSpots([...umbrellas].reverse(), count, sunbeds)).toEqual(expected);
    }
  });
});
