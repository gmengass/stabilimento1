import { describe, expect, it } from "vitest";
import { nextSeasonDraft, openSeason } from "@/lib/booking/seasons";

const season = (year: number) => ({ startDate: `${year}-05-01` });

describe("nextSeasonDraft", () => {
  it("suggests 1 May – 30 September of this year while it isn't over", () => {
    expect(nextSeasonDraft([], "2027-01-15")).toEqual({
      year: 2027,
      startDate: "2027-05-01",
      endDate: "2027-09-30",
    });
    expect(nextSeasonDraft([], "2027-09-30").year).toBe(2027);
  });

  it("moves to next year from 1 October", () => {
    expect(nextSeasonDraft([], "2027-10-01").year).toBe(2028);
  });

  it("skips years that already have a season", () => {
    expect(nextSeasonDraft([season(2027), season(2028)], "2027-03-01").year).toBe(2029);
    expect(nextSeasonDraft([season(2028)], "2027-03-01").year).toBe(2027);
  });
});

describe("openSeason", () => {
  const s2027 = { name: "2027", endDate: "2027-09-30" };

  it("is the season whose last day is today or later", () => {
    expect(openSeason([s2027], "2027-09-30")).toBe(s2027);
    expect(openSeason([s2027], "2027-10-01")).toBeUndefined();
  });
});
