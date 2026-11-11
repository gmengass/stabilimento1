import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
} from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { set, currentUser, queries } = vi.hoisted(() => ({
  set: vi.fn(),
  currentUser: { current: null as CurrentUser | null },
  queries: [] as CompiledQuery[],
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set })),
}));

vi.mock("@/lib/auth/session", () => ({
  readCurrentUser: vi.fn(async () => currentUser.current),
  getCurrentUser: vi.fn(async () => currentUser.current),
}));

// Compiles queries like Postgres would but never connects; every query is recorded.
const recordingDb = new Kysely<unknown>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  log: (event) => {
    if (event.level === "query") queries.push(event.query);
  },
});

vi.mock("@/db/client", () => ({ getDb: () => recordingDb }));

const { setLocale } = await import("@/i18n/actions");

const ONE_YEAR = 31_536_000;

const anna: CurrentUser = { id: "u1", username: "anna", name: "Anna", role: "staff", locale: "it" };

beforeEach(() => {
  set.mockClear();
  queries.length = 0;
  currentUser.current = null;
});

afterEach(() => vi.unstubAllEnvs());

describe("setLocale", () => {
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

describe("setLocale and the user's saved locale", () => {
  it("logged in, updates only that user's locale and sets the cookie", async () => {
    currentUser.current = anna;
    await expect(setLocale("en")).resolves.toEqual({ ok: true });

    expect(queries).toHaveLength(1);
    const [query] = queries;
    expect(query?.sql).toMatch(/^update "user" set "locale" = \$1 where "id" = \$2$/);
    expect(query?.parameters).toEqual(["en", "u1"]);
    expect(set).toHaveBeenCalledWith("locale", "en", expect.any(Object));
  });

  it("logged out, writes nothing to the database", async () => {
    await expect(setLocale("en")).resolves.toEqual({ ok: true });
    expect(queries).toEqual([]);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it.each([["fr"], ["EN"], [null]])("logged in, %j writes nothing anywhere", async (input) => {
    currentUser.current = anna;
    await expect(setLocale(input)).resolves.toEqual({ ok: false });
    expect(queries).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });
});
