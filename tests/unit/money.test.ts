import { describe, expect, it } from "vitest";
import { centsToInput, parseEuros } from "@/lib/pricing/money";

describe("parseEuros", () => {
  it.each([
    ["77", 7700],
    ["77,5", 7750],
    ["77.50", 7750],
    ["0", 0],
    [" € 2550 ", 255_000],
    ["0,05", 5],
  ])("reads %j as %d cents", (text, cents) => {
    expect(parseEuros(text)).toBe(cents);
  });

  it.each(["", "  ", "€"])("reads %j as blank", (text) => {
    expect(parseEuros(text)).toBe("blank");
  });

  it.each(["-1", "1.234,50", "7.777", "abc", "1e3", "12,345", "1234567890"])(
    "refuses %j",
    (text) => {
      expect(parseEuros(text)).toBeNull();
    },
  );
});

describe("centsToInput", () => {
  it.each([
    [7700, "77"],
    [7750, "77.50"],
    [5, "0.05"],
    [0, "0"],
  ])("shows %d cents as %j", (cents, text) => {
    expect(centsToInput(cents)).toBe(text);
    expect(parseEuros(text)).toBe(cents);
  });
});
