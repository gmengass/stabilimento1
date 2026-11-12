import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { actor, setupBeach } = vi.hoisted(() => ({
  actor: { current: null as CurrentUser | null },
  setupBeach: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/auth/session", () => ({ readCurrentUser: vi.fn(async () => actor.current) }));
vi.mock("@/lib/beach/layout", () => ({ setupBeach }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { setupBeachAction } = await import("@/app/(app)/admin/beach/actions");

const user = (role: CurrentUser["role"]): CurrentUser => ({
  id: "u1",
  username: "anna",
  name: "Anna",
  role,
  locale: "it",
});

beforeEach(() => vi.clearAllMocks());

describe("setupBeachAction", () => {
  it.each([
    ["logged out", null],
    ["staff", user("staff")],
  ])("is forbidden when %s", async (_label, current) => {
    actor.current = current;
    await expect(setupBeachAction({})).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(setupBeach).not.toHaveBeenCalled();
  });

  it("runs the setup for an admin", async () => {
    actor.current = user("admin");
    await expect(setupBeachAction({ lines: 1 })).resolves.toEqual({ ok: true });
    expect(setupBeach).toHaveBeenCalledWith({}, { lines: 1 });
  });
});
