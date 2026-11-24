import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultTheme, isTheme, resolveTheme, themes } from "@/theme/config";

const { set } = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set })),
}));

const { setTheme } = await import("@/theme/actions");

const ONE_YEAR = 31_536_000;

describe("resolveTheme", () => {
  it("offers exactly the five themes, in menu order", () => {
    expect(themes).toEqual(["system", "light", "dark", "arturo", "sera"]);
  });

  it("defaults to following the device", () => {
    expect(defaultTheme).toBe("system");
    expect(resolveTheme(undefined)).toBe("system");
  });

  it.each(themes)("keeps a valid cookie value: %s", (theme) => {
    expect(resolveTheme(theme)).toBe(theme);
  });

  it.each(["", "DARK", "blue", "dark ", "ARTURO", "sera "])(
    "falls back for an unknown value: %j",
    (value) => {
      expect(resolveTheme(value)).toBe("system");
    },
  );

  it("isTheme rejects non-strings", () => {
    expect(isTheme(1)).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe("setTheme", () => {
  beforeEach(() => set.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it.each(themes)("saves %s in a one-year, httpOnly cookie", async (theme) => {
    await expect(setTheme(theme)).resolves.toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith("theme", theme, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: ONE_YEAR,
      secure: false,
    });
  });

  it("marks the cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setTheme("dark");
    expect(set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it.each(["blue", "", null, { theme: "dark" }])("refuses %j and writes nothing", async (input) => {
    await expect(setTheme(input)).resolves.toEqual({ ok: false });
    expect(set).not.toHaveBeenCalled();
  });
});
