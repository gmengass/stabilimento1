import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieSet, refresh } = vi.hoisted(() => ({ cookieSet: vi.fn(), refresh: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSet, get: vi.fn(), has: vi.fn(), delete: vi.fn() })),
}));

vi.mock("next/cache", () => ({ refresh }));

vi.mock("@/i18n/locale", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/i18n/locale")>();
  return { ...original, saveUserLocalePreference: vi.fn(async () => undefined) };
});

import { setLocale } from "@/i18n/actions";
import { saveUserLocalePreference } from "@/i18n/locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface CookieCall {
  name: unknown;
  value: unknown;
  options: Record<string, unknown>;
}

/** Normalizes both `set(name, value, options)` and `set({ name, value, ...options })`. */
function cookieCall(args: unknown[]): CookieCall {
  if (typeof args[0] === "string") {
    return { name: args[0], value: args[1], options: (args[2] ?? {}) as Record<string, unknown> };
  }
  const { name, value, ...options } = args[0] as Record<string, unknown>;
  return { name, value, options };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setLocale", () => {
  it.each(["it", "en"] as const)(
    "sets the cookie, saves the preference and refreshes for %j",
    async (locale) => {
      await setLocale(locale);

      expect(cookieSet).toHaveBeenCalledTimes(1);
      const call = cookieCall(cookieSet.mock.calls[0]);
      expect(call.name).toBe("locale");
      expect(call.value).toBe(locale);
      expect(call.options).toMatchObject({
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        maxAge: ONE_YEAR_SECONDS,
      });

      expect(saveUserLocalePreference).toHaveBeenCalledWith(locale);
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );

  it.each([["fr"], ["EN"], [""], [42], [undefined], [null], [{ locale: "en" }]])(
    "rejects %j and leaves the cookie unchanged",
    async (value) => {
      await expect(setLocale(value)).rejects.toThrow();

      expect(cookieSet).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(saveUserLocalePreference).not.toHaveBeenCalled();
    },
  );
});
