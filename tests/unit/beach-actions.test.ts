import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { actor, layout, edit } = vi.hoisted(() => {
  const ok = () => vi.fn(async () => ({ ok: true as const }));
  return {
    actor: { current: null as CurrentUser | null },
    layout: { setupBeach: ok() },
    edit: {
      renameVenue: ok(),
      addLine: ok(),
      addUmbrellas: ok(),
      removeLastLine: ok(),
      updateSpot: ok(),
      removeSpot: ok(),
      addArea: ok(),
      renameArea: ok(),
      removeArea: ok(),
    },
  };
});

vi.mock("@/lib/auth/session", () => ({ readCurrentUser: vi.fn(async () => actor.current) }));
vi.mock("@/lib/beach/layout", () => layout);
vi.mock("@/lib/beach/edit", () => edit);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("@/app/(app)/admin/beach/actions");

const user = (role: CurrentUser["role"]): CurrentUser => ({
  id: "u1",
  username: "anna",
  name: "Anna",
  role,
  locale: "it",
});

const cases = [
  ["setupBeachAction", actions.setupBeachAction, layout.setupBeach],
  ["renameVenueAction", actions.renameVenueAction, edit.renameVenue],
  ["addLineAction", actions.addLineAction, edit.addLine],
  ["addUmbrellasAction", actions.addUmbrellasAction, edit.addUmbrellas],
  ["removeLastLineAction", actions.removeLastLineAction, edit.removeLastLine],
  ["updateSpotAction", actions.updateSpotAction, edit.updateSpot],
  ["removeSpotAction", actions.removeSpotAction, edit.removeSpot],
  ["addAreaAction", actions.addAreaAction, edit.addArea],
  ["renameAreaAction", actions.renameAreaAction, edit.renameArea],
  ["removeAreaAction", actions.removeAreaAction, edit.removeArea],
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
