import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set })),
}));

const { setLocale } = await import("@/i18n/actions");

const ONE_YEAR = 31_536_000;

describe("setLocale", () => {
  beforeEach(() => set.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it.each(["en", "it"])("accepts %s and sets the locale cookie", async (locale) => {
    await expect(setLocale(locale)).resolves.toEqual({ ok: true });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("locale", locale, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: ONE_YEAR,
      secure: expect.any(Boolean),
    });
  });

  it.each([["fr"], [42], [null], [{}], ["en; Path=/x"], [undefined], ["EN"]])(
    "rejects %j and sets no cookie",
    async (input) => {
      await expect(setLocale(input)).resolves.toEqual({ ok: false });
      expect(set).not.toHaveBeenCalled();
    },
  );

  it("sets a secure cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(setLocale("en")).resolves.toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith("locale", "en", expect.objectContaining({ secure: true }));
  });

  it("sets a non-secure cookie outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setLocale("it");
    expect(set).toHaveBeenCalledWith("locale", "it", expect.objectContaining({ secure: false }));
  });
});
