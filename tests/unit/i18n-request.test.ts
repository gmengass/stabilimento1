import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieValue, userPreference } = vi.hoisted(() => ({
  cookieValue: { current: undefined as string | undefined },
  userPreference: { current: null as "it" | "en" | null },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "locale" && cookieValue.current !== undefined
        ? { name, value: cookieValue.current }
        : undefined,
  })),
}));

vi.mock("next-intl/server", () => ({
  getRequestConfig: (factory: unknown) => factory,
}));

vi.mock("@/i18n/locale", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/i18n/locale")>();
  return { ...original, getUserLocalePreference: vi.fn(async () => userPreference.current) };
});

import requestConfig from "@/i18n/request";

type Factory = () => Promise<{
  locale: string;
  messages: { home: { title: string } };
  timeZone: string;
}>;
const loadConfig = requestConfig as unknown as Factory;

beforeEach(() => {
  cookieValue.current = undefined;
  userPreference.current = null;
});

describe("request config", () => {
  it.each([
    [undefined, "it"],
    ["en", "en"],
    ["fr", "it"],
    ["", "it"],
  ])("cookie %j resolves to %j with matching messages", async (cookie, expected) => {
    cookieValue.current = cookie;
    const config = await loadConfig();
    expect(config.locale).toBe(expected);
    expect(config.timeZone).toBe("Europe/Rome");
    const catalog = await import(`../../messages/${expected}.json`);
    expect(config.messages).toEqual(catalog.default);
  });

  it("prefers the saved user preference over the cookie", async () => {
    cookieValue.current = "it";
    userPreference.current = "en";
    expect((await loadConfig()).locale).toBe("en");
  });
});
