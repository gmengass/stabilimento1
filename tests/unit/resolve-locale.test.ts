import { describe, expect, it } from "vitest";
import { resolveLocale } from "@/i18n/resolve-locale";

const invalid = ["EN", "fr", "", "it-IT", "en; Path=/", " en", "garbage\u0000"];

describe("resolveLocale", () => {
  it("defaults to it with no inputs", () => {
    expect(resolveLocale({})).toBe("it");
    expect(resolveLocale({ user: null, cookie: null })).toBe("it");
  });

  it("uses a valid cookie when there is no user preference", () => {
    expect(resolveLocale({ cookie: "en" })).toBe("en");
    expect(resolveLocale({ user: null, cookie: "it" })).toBe("it");
  });

  it("user preference beats the cookie", () => {
    expect(resolveLocale({ user: "en", cookie: "it" })).toBe("en");
    expect(resolveLocale({ user: "it", cookie: "en" })).toBe("it");
  });

  it.each(invalid)("skips invalid user value %j and falls back to the cookie", (user) => {
    expect(resolveLocale({ user, cookie: "en" })).toBe("en");
  });

  it.each(invalid)("skips invalid cookie value %j and falls back to it", (cookie) => {
    expect(resolveLocale({ cookie })).toBe("it");
  });

  it("falls back to it when both levels are invalid", () => {
    expect(resolveLocale({ user: "EN", cookie: "fr" })).toBe("it");
  });
});
