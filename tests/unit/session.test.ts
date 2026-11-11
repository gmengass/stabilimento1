import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, requestHeaders } = vi.hoisted(() => ({
  getSession: vi.fn(),
  requestHeaders: new Headers({ cookie: "better-auth.session_token=abc" }),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => requestHeaders) }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

vi.mock("@/lib/auth/auth", () => ({ getAuth: () => ({ api: { getSession } }) }));

const { getCurrentUser, readCurrentUser, requireAdmin, requireUser } =
  await import("@/lib/auth/session");

function sessionFor(user: Record<string, unknown>) {
  return {
    session: { id: "s1", userId: user.id, token: "abc" },
    user: {
      email: "anna@staff.invalid",
      emailVerified: false,
      banned: false,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      ...user,
    },
  };
}

const anna = { id: "u1", username: "anna", name: "Anna", role: "staff", locale: "en" };
const boss = { id: "u2", username: "boss", name: "Boss", role: "admin", locale: "it" };

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue(null);
});

describe.each([
  ["readCurrentUser", readCurrentUser],
  ["getCurrentUser", getCurrentUser],
])("%s", (_name, read) => {
  it("returns null without a session", async () => {
    await expect(read()).resolves.toBeNull();
  });

  it("passes the request headers to getSession", async () => {
    await read();
    expect(getSession).toHaveBeenCalledWith(expect.objectContaining({ headers: requestHeaders }));
  });

  it("returns only the public user fields", async () => {
    getSession.mockResolvedValue(sessionFor(anna));
    await expect(read()).resolves.toEqual(anna);
  });

  it("falls back to staff and the default locale for unexpected values", async () => {
    getSession.mockResolvedValue(sessionFor({ ...anna, role: "owner", locale: "fr" }));
    await expect(read()).resolves.toMatchObject({ role: "staff", locale: "it" });
  });
});

describe("requireUser", () => {
  it("redirects to /login without a session", async () => {
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it.each([anna, boss])("returns $role users", async (user) => {
    getSession.mockResolvedValue(sessionFor(user));
    await expect(requireUser()).resolves.toEqual(user);
  });
});

describe("requireAdmin", () => {
  it("redirects to /login without a session", async () => {
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("redirects staff to /", async () => {
    getSession.mockResolvedValue(sessionFor(anna));
    await expect(requireAdmin()).rejects.toThrow(/^NEXT_REDIRECT \/$/);
  });

  it("returns an admin", async () => {
    getSession.mockResolvedValue(sessionFor(boss));
    await expect(requireAdmin()).resolves.toEqual(boss);
  });
});
