import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { actor, seasons } = vi.hoisted(() => {
  const ok = () => vi.fn(async () => ({ ok: true as const }));
  return {
    actor: { current: null as CurrentUser | null },
    seasons: { createSeason: ok(), updateSeason: ok(), removeSeason: ok() },
  };
});

vi.mock("@/lib/auth/session", () => ({ readCurrentUser: vi.fn(async () => actor.current) }));
vi.mock("@/lib/booking/seasons", () => seasons);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("@/app/(app)/admin/seasons/actions");

const user = (role: CurrentUser["role"]): CurrentUser => ({
  id: "u1",
  username: "anna",
  name: "Anna",
  role,
  locale: "it",
});

const cases = [
  ["createSeasonAction", actions.createSeasonAction, seasons.createSeason],
  ["updateSeasonAction", actions.updateSeasonAction, seasons.updateSeason],
  ["removeSeasonAction", actions.removeSeasonAction, seasons.removeSeason],
] as const;

beforeEach(() => vi.clearAllMocks());

describe.each(cases)("%s", (_name, action, operation) => {
  it.each([
    ["logged out", null],
    ["staff", user("staff")],
  ])("is forbidden when %s", async (_label, current) => {
    actor.current = current;
    await expect(action({})).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("runs for an admin", async () => {
    actor.current = user("admin");
    await expect(action({ x: 1 })).resolves.toEqual({ ok: true });
    expect(operation).toHaveBeenCalledWith({}, { x: 1 });
  });
});
