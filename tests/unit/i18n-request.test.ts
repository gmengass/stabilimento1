import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieValue } = vi.hoisted(() => ({
  cookieValue: { current: undefined as string | undefined },
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

import requestConfig from "@/i18n/request";

type Factory = () => Promise<{ locale: string; messages: unknown; timeZone: string }>;
const loadConfig = requestConfig as unknown as Factory;

beforeEach(() => {
  cookieValue.current = undefined;
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
