import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { actor, audit, layout, edit } = vi.hoisted(() => {
  const ok = () => vi.fn(async () => ({ ok: true as const }));
  return {
    actor: { current: null as CurrentUser | null },
    audit: { writeEntry: vi.fn(async () => 1) },
    layout: { setupBeach: ok() },
    edit: {
      renameVenue: ok(),
      setDefaultHold: ok(),
      setStock: vi.fn(async () => ({
        ok: true as const,
        areaName: "Main",
        from: { sunbedStock: null, deckchairStock: null },
        to: { sunbedStock: 20, deckchairStock: 4 },
      })),
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
vi.mock("@/lib/booking/audit", () => audit);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("@/app/(app)/admin/beach/actions");

const user = (role: CurrentUser["role"]): CurrentUser => ({
  id: "u1",
  username: "anna",
  name: "Anna",
  role,
  locale: "it",
  communal: false,
  sessionId: "s1",
});

const cases = [
  ["setupBeachAction", actions.setupBeachAction, layout.setupBeach],
  ["renameVenueAction", actions.renameVenueAction, edit.renameVenue],
  ["setDefaultHoldAction", actions.setDefaultHoldAction, edit.setDefaultHold],
  ["setStockAction", actions.setStockAction, edit.setStock],
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
    expect(audit.writeEntry).not.toHaveBeenCalled();
  });

  it("runs for an admin", async () => {
    actor.current = user("admin");
    await expect(action({ x: 1 })).resolves.toMatchObject({ ok: true });
    expect(operation).toHaveBeenCalledWith({}, { x: 1 });
    expect(audit.writeEntry).toHaveBeenCalledWith(
      {},
      {
        userId: "u1",
        action: "beach",
        detail: expect.objectContaining({ what: expect.any(String) }),
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

describe("setDefaultHoldAction", () => {
  it("logs the old and the new check-in time", async () => {
    actor.current = user("admin");
    edit.setDefaultHold.mockResolvedValueOnce({ ok: true, from: "11:00", to: "12:30" } as never);
    await actions.setDefaultHoldAction({ defaultHoldUntil: "12:30" });
    expect(audit.writeEntry).toHaveBeenCalledWith(
      {},
      {
        userId: "u1",
        action: "beach",
        detail: { what: "setDefaultHold", from: "11:00", to: "12:30" },
      },
    );
  });
});

describe("setStockAction", () => {
  it("logs the space and the old and new stock, with blank for not tracked", async () => {
    actor.current = user("admin");
    await actions.setStockAction({ areaId: 1, sunbedStock: 20, deckchairStock: 4 });
    expect(audit.writeEntry).toHaveBeenCalledWith(
      {},
      {
        userId: "u1",
        action: "beach",
        detail: {
          what: "setStock",
          area: "Main",
          fromSunbeds: "",
          toSunbeds: 20,
          fromDeckchairs: "",
          toDeckchairs: 4,
        },
      },
    );
  });
});
