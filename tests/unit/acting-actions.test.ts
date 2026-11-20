import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { user, acting, cache } = vi.hoisted(() => ({
  user: { current: null as CurrentUser | null },
  acting: {
    choose: vi.fn(async () => ({ ok: true as const })),
    clear: vi.fn(async () => undefined),
    list: vi.fn(async () => [{ id: "a1", name: "Anna" }]),
  },
  cache: { revalidatePath: vi.fn() },
}));

vi.mock("@/lib/auth/acting", () => ({
  chooseActing: acting.choose,
  clearActing: acting.clear,
  listActingChoices: acting.list,
}));
vi.mock("@/lib/auth/session", () => ({ readCurrentUser: vi.fn(async () => user.current) }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/cache", () => cache);

const { chooseActingAction, clearActingAction } = await import("@/app/(app)/acting-actions");

const base: CurrentUser = {
  id: "u1",
  username: "anna",
  name: "Anna",
  role: "staff",
  locale: "it",
  communal: false,
  sessionId: "s1",
};
const tablet: CurrentUser = { ...base, id: "tablet", communal: true, sessionId: "s-tablet" };

beforeEach(() => vi.clearAllMocks());

describe("chooseActingAction", () => {
  it("is forbidden when logged out", async () => {
    user.current = null;
    await expect(chooseActingAction({ staffId: "a1" })).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(acting.choose).not.toHaveBeenCalled();
  });

  it("is forbidden for a normal account", async () => {
    user.current = base;
    await expect(chooseActingAction({ staffId: "a1" })).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(acting.choose).not.toHaveBeenCalled();
  });

  it("sets the acting staff on the tablet's own session", async () => {
    user.current = tablet;
    await expect(chooseActingAction({ staffId: "a1" })).resolves.toEqual({ ok: true });
    expect(acting.choose).toHaveBeenCalledWith({}, "s-tablet", "a1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("rejects malformed input", async () => {
    user.current = tablet;
    await expect(chooseActingAction({ staffId: 5 })).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
    expect(acting.choose).not.toHaveBeenCalled();
  });

  it("passes a refusal through", async () => {
    user.current = tablet;
    acting.choose.mockResolvedValueOnce({ ok: false, error: "invalid" } as never);
    await expect(chooseActingAction({ staffId: "x" })).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("clearActingAction", () => {
  it("is forbidden for a normal account", async () => {
    user.current = base;
    await expect(clearActingAction()).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(acting.clear).not.toHaveBeenCalled();
  });

  it("clears the tablet's own session", async () => {
    user.current = tablet;
    await expect(clearActingAction()).resolves.toEqual({ ok: true });
    expect(acting.clear).toHaveBeenCalledWith({}, "s-tablet");
  });
});
