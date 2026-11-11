import { describe, expect, it } from "vitest";
import { defaultLocale, LOCALE_COOKIE, locales, VENUE_TIME_ZONE } from "@/i18n/config";
import {
  getUserLocalePreference,
  isLocale,
  resolveLocale,
  saveUserLocalePreference,
} from "@/i18n/locale";

describe("i18n config", () => {
  it("exposes the supported locales, default, cookie name and venue time zone", () => {
    expect(locales).toEqual(["it", "en"]);
    expect(defaultLocale).toBe("it");
    expect(LOCALE_COOKIE).toBe("locale");
    expect(VENUE_TIME_ZONE).toBe("Europe/Rome");
  });
});

describe("isLocale", () => {
  it.each(["it", "en"])("accepts %j", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  it.each([["fr"], ["EN"], ["It"], [" en"], [""], [undefined], [null], [42], [{}], [["it"]]])(
    "rejects %j",
    (value) => {
      expect(isLocale(value)).toBe(false);
    },
  );
});

describe("resolveLocale", () => {
  it("defaults to Italian with no preference and no cookie", () => {
    expect(resolveLocale({ userPreference: null, cookie: undefined })).toBe("it");
  });

  it.each(["it", "en"] as const)("uses a valid cookie %j", (cookie) => {
    expect(resolveLocale({ userPreference: null, cookie })).toBe(cookie);
  });

  it.each(["fr", "", "EN", " en", "en-US", "it;"])(
    "falls back to Italian for invalid cookie %j",
    (cookie) => {
      expect(resolveLocale({ userPreference: null, cookie })).toBe("it");
    },
  );

  it("lets the user preference win over the cookie", () => {
    expect(resolveLocale({ userPreference: "en", cookie: "it" })).toBe("en");
    expect(resolveLocale({ userPreference: "it", cookie: "en" })).toBe("it");
  });

  it("uses the user preference when the cookie is missing or invalid", () => {
    expect(resolveLocale({ userPreference: "en", cookie: undefined })).toBe("en");
    expect(resolveLocale({ userPreference: "en", cookie: "fr" })).toBe("en");
  });
});

describe("user preference seams", () => {
  it("getUserLocalePreference returns null until auth exists", async () => {
    await expect(getUserLocalePreference()).resolves.toBeNull();
  });

  it("saveUserLocalePreference resolves as a no-op", async () => {
    await expect(saveUserLocalePreference("en")).resolves.toBeUndefined();
  });
});
