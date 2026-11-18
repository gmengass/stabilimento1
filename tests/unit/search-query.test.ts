import { describe, expect, it } from "vitest";
import { parseQuery } from "@/lib/booking/search";

/**
 * Rules (docs/plans/date-view-counts.md):
 * - Input is trimmed. If it contains any letter (Unicode, so "Lù" counts), it is a NAME search,
 *   even when it also has digits ("Rossi 333" is a name). A name needs at least 2 letters.
 * - Otherwise it is a PHONE search on its digits only: spaces, "+", "-" and other non-digits are
 *   dropped. A phone needs at least 3 digits.
 * - Anything shorter is `{ kind: "short" }` so the UI can show a hint.
 * - The name pattern is ready for `ILIKE ... ESCAPE '\'`: the trimmed text with `\`, `%` and `_`
 *   escaped, wrapped in `%` for a substring match. Case is left alone (ILIKE ignores it).
 */
describe("parseQuery: name", () => {
  it("is a substring pattern of the trimmed text", () => {
    expect(parseQuery("  Rossi ")).toEqual({ kind: "name", pattern: "%Rossi%" });
  });

  it("needs at least two letters", () => {
    expect(parseQuery("ro")).toEqual({ kind: "name", pattern: "%ro%" });
    expect(parseQuery("r")).toEqual({ kind: "short" });
    expect(parseQuery(" r ")).toEqual({ kind: "short" });
    expect(parseQuery("r.")).toEqual({ kind: "short" });
  });

  it("counts accented and non-Latin letters", () => {
    expect(parseQuery("Lù")).toEqual({ kind: "name", pattern: "%Lù%" });
  });

  it("treats mixed letters and digits as a name", () => {
    expect(parseQuery("Rossi 333")).toEqual({ kind: "name", pattern: "%Rossi 333%" });
    expect(parseQuery("a1")).toEqual({ kind: "short" });
  });

  it("escapes LIKE wildcards and the escape character so they match literally", () => {
    expect(parseQuery("50%ab")).toEqual({ kind: "name", pattern: "%50\\%ab%" });
    expect(parseQuery("Bar_Mare")).toEqual({ kind: "name", pattern: "%Bar\\_Mare%" });
    expect(parseQuery("Ab\\Cd")).toEqual({ kind: "name", pattern: "%Ab\\\\Cd%" });
    expect(parseQuery("a%_\\b")).toEqual({ kind: "name", pattern: "%a\\%\\_\\\\b%" });
  });

  it("does not count wildcards as letters", () => {
    expect(parseQuery("a%")).toEqual({ kind: "short" });
    expect(parseQuery("_a_")).toEqual({ kind: "short" });
  });
});

describe("parseQuery: phone", () => {
  it("keeps only the digits", () => {
    expect(parseQuery("333 12")).toEqual({ kind: "phone", digits: "33312" });
    expect(parseQuery("+39 333 1234567")).toEqual({ kind: "phone", digits: "393331234567" });
    expect(parseQuery("333-123-4567")).toEqual({ kind: "phone", digits: "3331234567" });
  });

  it("needs at least three digits", () => {
    expect(parseQuery("333")).toEqual({ kind: "phone", digits: "333" });
    expect(parseQuery("33")).toEqual({ kind: "short" });
    expect(parseQuery("+39")).toEqual({ kind: "short" });
    expect(parseQuery("3 3")).toEqual({ kind: "short" });
  });

  it("does not treat wildcards as part of a phone", () => {
    expect(parseQuery("33%3")).toEqual({ kind: "phone", digits: "333" });
    expect(parseQuery("%_%")).toEqual({ kind: "short" });
  });
});

describe("parseQuery: control characters", () => {
  it("drops them, so a NUL never reaches Postgres", () => {
    expect(parseQuery("Ro\u0000ssi")).toEqual({ kind: "name", pattern: "%Rossi%" });
    expect(parseQuery("\u0000ab")).toEqual({ kind: "name", pattern: "%ab%" });
    expect(parseQuery("33\u00003")).toEqual({ kind: "phone", digits: "333" });
    expect(parseQuery("\u0000a")).toEqual({ kind: "short" });
  });
});

describe("parseQuery: empty input", () => {
  it("is short", () => {
    expect(parseQuery("")).toEqual({ kind: "short" });
    expect(parseQuery("   ")).toEqual({ kind: "short" });
    expect(parseQuery("+ - +")).toEqual({ kind: "short" });
  });
});
