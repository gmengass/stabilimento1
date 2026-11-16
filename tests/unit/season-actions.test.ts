import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { actor, audit, seasons } = vi.hoisted(() => {
  const ok = () => vi.fn(async () => ({ ok: true as const }));
  return {
    actor: { current: null as CurrentUser | null },
    audit: { writeEntry: vi.fn(async () => 1) },
    seasons: { createSeason: ok(), updateSeason: ok(), removeSeason: ok() },
  };
});

vi.mock("@/lib/auth/session", () => ({ readCurrentUser: vi.fn(async () => actor.current) }));
vi.mock("@/lib/booking/seasons", () => seasons);
vi.mock("@/lib/booking/audit", () => audit);
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
    expect(audit.writeEntry).not.toHaveBeenCalled();
  });

  it("runs for an admin", async () => {
    actor.current = user("admin");
    await expect(action({ x: 1 })).resolves.toEqual({ ok: true });
    expect(operation).toHaveBeenCalledWith({}, { x: 1 });
    expect(audit.writeEntry).toHaveBeenCalledWith(
      {},
      {
        userId: "u1",
        action: "season",
        detail: { what: expect.any(String) },
      },
    );
  });

  it("still reports success when the log write fails", async () => {
    actor.current = user("admin");
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    audit.writeEntry.mockRejectedValueOnce(new Error("db down"));
    await expect(action({})).resolves.toMatchObject({ ok: true });
  });

  it("logs nothing when the change fails", async () => {
    actor.current = user("admin");
    vi.mocked(operation).mockResolvedValueOnce({ ok: false, error: "invalid" } as never);
    await expect(action({})).resolves.toMatchObject({ ok: false });
    expect(audit.writeEntry).not.toHaveBeenCalled();
  });
});
