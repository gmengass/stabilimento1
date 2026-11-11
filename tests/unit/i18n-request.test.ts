import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieValue, userLocale } = vi.hoisted(() => ({
  cookieValue: { current: undefined as string | undefined },
  userLocale: { current: undefined as string | undefined },
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

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () =>
    userLocale.current === undefined
      ? null
      : { id: "u1", username: "anna", name: "Anna", role: "staff", locale: userLocale.current },
  ),
}));

import requestConfig from "@/i18n/request";

type Factory = () => Promise<{ locale: string; messages: unknown; timeZone: string }>;
const loadConfig = requestConfig as unknown as Factory;

beforeEach(() => {
  cookieValue.current = undefined;
  userLocale.current = undefined;
});

describe("request config", () => {
  it.each([
    [undefined, "it"],
    ["en", "en"],
    ["it", "it"],
    ["fr", "it"],
    ["", "it"],
    ["../en", "it"],
  ])("cookie %j loads the %j locale and its messages", async (cookie, expected) => {
    cookieValue.current = cookie;
    const config = await loadConfig();
    expect(config.locale).toBe(expected);
    expect(config.timeZone).toBe("Europe/Rome");
    const catalog = await import(`../../messages/${expected}.json`);
    expect(config.messages).toEqual(catalog.default);
  });
});

describe("request config with a logged-in user", () => {
  it.each([
    ["en", "it", "en"],
    ["it", "en", "it"],
    ["en", undefined, "en"],
  ])("user locale %j beats cookie %j", async (user, cookie, expected) => {
    userLocale.current = user;
    cookieValue.current = cookie;
    expect((await loadConfig()).locale).toBe(expected);
  });

  it("follows the user to a new browser without a cookie", async () => {
    userLocale.current = "en";
    const config = await loadConfig();
    const catalog = await import("../../messages/en.json");
    expect(config.messages).toEqual(catalog.default);
  });
});
