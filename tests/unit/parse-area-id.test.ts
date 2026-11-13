import { describe, expect, it } from "vitest";
import { parseAreaId } from "@/lib/beach/layout";

describe("parseAreaId", () => {
  it("is undefined when the URL has no area (show the first space)", () => {
    expect(parseAreaId(undefined)).toBeUndefined();
  });

  it("reads a numeric id", () => {
    expect(parseAreaId("12")).toBe(12);
  });

  it.each(["", "abc", "1.5", "-1", "1234567890", ["1", "2"]])(
    "turns %o into 0, which matches no space and so redirects",
    (value) => {
      expect(parseAreaId(value)).toBe(0);
    },
  );
});
