import { describe, expect, it } from "vitest";
import type { SpotView } from "@/components/beach-map";
import { statusMarkKey } from "@/lib/beach/status-mark";
import en from "../../messages/en.json";
import itMessages from "../../messages/it.json";

describe("statusMarkKey", () => {
  it.each([
    ["booked", "markBooked"],
    ["season", "markSeason"],
    ["released", "markSeason"],
    ["noShow", "markNoShow"],
    ["checkedIn", "markCheckedIn"],
  ] as const)("%s shows %s", (view: SpotView, key) => {
    expect(statusMarkKey(view)).toBe(key);
  });

  it.each(["free", "selected", "open"] as const)("%s shows no mark", (view: SpotView) => {
    expect(statusMarkKey(view)).toBeUndefined();
  });
});

describe("status mark messages", () => {
  it("Italian marks", () => {
    expect(itMessages.map).toMatchObject({
      markBooked: "P",
      markSeason: "S",
      markNoShow: "?",
      markCheckedIn: "✓",
    });
  });

  it("English marks", () => {
    expect(en.map).toMatchObject({
      markBooked: "B",
      markSeason: "S",
      markNoShow: "?",
      markCheckedIn: "✓",
    });
  });
});
