import { describe, expect, it } from "vitest";
import { multiLine, singleLine } from "@/lib/text";

describe("singleLine", () => {
  const name = singleLine(10);

  it("drops NUL and other control characters, then trims", () => {
    expect(name.parse(" Ro\u0000s\u0007a\n ")).toBe("Rosa");
  });

  it("refuses a name that is only control characters or spaces", () => {
    expect(name.safeParse("\u0000\u0001 ").success).toBe(false);
  });

  it("keeps letters from any language and counts the cleaned length", () => {
    expect(name.parse("Zoë Ñúñez")).toBe("Zoë Ñúñez");
    expect(name.safeParse(`${"a".repeat(10)}\u0000`).success).toBe(true);
    expect(name.safeParse("a".repeat(11)).success).toBe(false);
  });
});

describe("multiLine", () => {
  const notes = multiLine(20);

  it("keeps line breaks and tabs, drops other control characters", () => {
    expect(notes.parse("one\r\ntwo\tthree\u0000\u001b")).toBe("one\ntwo\tthree");
  });

  it("accepts empty text", () => {
    expect(notes.parse("  ")).toBe("");
  });
});
