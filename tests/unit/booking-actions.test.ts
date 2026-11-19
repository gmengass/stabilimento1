import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const {
  actor,
  bookingsModule,
  checkInModule,
  moveModule,
  passesModule,
  quickBookModule,
  undoModule,
  cache,
} = vi.hoisted(() => ({
  actor: { current: null as CurrentUser | null },
  bookingsModule: {
    createBooking: vi.fn(async () => ({ ok: true as const, bookingId: 1 })),
    cancelBooking: vi.fn(async () => ({ ok: true as const })),
  },
  checkInModule: {
    checkIn: vi.fn(async () => ({ ok: true as const })),
    uncheck: vi.fn(async () => ({ ok: true as const })),
    restoreNoShow: vi.fn(async () => ({ ok: true as const })),
    setHold: vi.fn(async () => ({ ok: true as const })),
  },
  moveModule: { moveBooking: vi.fn(async () => ({ ok: true as const })) },
  passesModule: {
    createSeasonPass: vi.fn(async () => ({ ok: true as const, bookingId: 2 })),
    releaseDays: vi.fn(async () => ({ ok: true as const, days: 1 })),
    restoreDays: vi.fn(async () => ({ ok: true as const, days: 1 })),
    endSeasonPass: vi.fn(async () => ({ ok: true as const })),
  },
  quickBookModule: {
    suggestQuickBook: vi.fn(async () => ({ ok: true as const, suggestions: [] })),
  },
  undoModule: { undoEntry: vi.fn(async () => ({ ok: true as const })) },
  cache: { revalidatePath: vi.fn() },
}));

vi.mock("@/lib/auth/session", () => ({ readCurrentUser: vi.fn(async () => actor.current) }));
vi.mock("@/lib/booking/bookings", () => bookingsModule);
vi.mock("@/lib/booking/check-in", () => checkInModule);
vi.mock("@/lib/booking/move", () => moveModule);
vi.mock("@/lib/booking/passes", () => passesModule);
vi.mock("@/lib/booking/quick-book", () => quickBookModule);
vi.mock("@/lib/booking/undo", () => undoModule);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/cache", () => cache);

const {
  createBookingAction,
  cancelBookingAction,
  moveBookingAction,
  createSeasonPassAction,
  releaseDaysAction,
  restoreDaysAction,
  endSeasonPassAction,
  checkInAction,
  uncheckAction,
  restoreNoShowAction,
  setHoldAction,
  suggestQuickBookAction,
  undoAction,
} = await import("@/app/(app)/booking-actions");

const staff: CurrentUser = {
  id: "u1",
  username: "anna",
  name: "Anna",
  role: "staff",
  locale: "it",
};

const actions = [
  ["createBookingAction", createBookingAction, bookingsModule.createBooking],
  ["cancelBookingAction", cancelBookingAction, bookingsModule.cancelBooking],
  ["moveBookingAction", moveBookingAction, moveModule.moveBooking],
  ["createSeasonPassAction", createSeasonPassAction, passesModule.createSeasonPass],
] as const;

const dayActions = [
  ["releaseDaysAction", releaseDaysAction, passesModule.releaseDays],
  ["restoreDaysAction", restoreDaysAction, passesModule.restoreDays],
  ["endSeasonPassAction", endSeasonPassAction, passesModule.endSeasonPass],
  ["checkInAction", checkInAction, checkInModule.checkIn],
  ["uncheckAction", uncheckAction, checkInModule.uncheck],
  ["restoreNoShowAction", restoreNoShowAction, checkInModule.restoreNoShow],
  ["setHoldAction", setHoldAction, checkInModule.setHold],
] as const;

beforeEach(() => vi.clearAllMocks());

describe.each(actions)("%s", (_name, action, operation) => {
  it("is forbidden when logged out", async () => {
    actor.current = null;
    await expect(action({})).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("runs for staff, recording who did it", async () => {
    actor.current = staff;
    await expect(action({ x: 1 })).resolves.toMatchObject({ ok: true });
    expect(operation).toHaveBeenCalledWith({}, "u1", { x: 1 });
  });
});

describe.each(dayActions)("%s", (_name, action, operation) => {
  it("is forbidden when logged out", async () => {
    actor.current = null;
    await expect(action({})).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("runs for staff, recording who did it", async () => {
    actor.current = staff;
    await expect(action({ x: 1 })).resolves.toMatchObject({ ok: true });
    expect(operation).toHaveBeenCalledWith({}, "u1", { x: 1 });
  });
});

describe("deckchairs (ADR 0020)", () => {
  const input = {
    customerName: "Rossi",
    startDate: "2027-07-10",
    endDate: "2027-07-10",
    spots: [{ spotId: 1, sunbeds: 2 }],
    deckchairs: 2,
  };

  it("createBookingAction passes the deckchairs to createBooking unchanged", async () => {
    actor.current = staff;
    await createBookingAction(input);
    expect(bookingsModule.createBooking).toHaveBeenCalledWith(
      {},
      "u1",
      expect.objectContaining({ deckchairs: 2 }),
    );
  });

  it("createSeasonPassAction passes the deckchairs to createSeasonPass unchanged", async () => {
    actor.current = staff;
    await createSeasonPassAction({ ...input, seasonId: 1, deckchairs: 1 });
    expect(passesModule.createSeasonPass).toHaveBeenCalledWith(
      {},
      "u1",
      expect.objectContaining({ deckchairs: 1 }),
    );
  });
});

describe("suggestQuickBookAction", () => {
  it("is forbidden when logged out", async () => {
    actor.current = null;
    await expect(suggestQuickBookAction({})).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(quickBookModule.suggestQuickBook).not.toHaveBeenCalled();
  });

  it("suggests for staff without touching the cache", async () => {
    actor.current = staff;
    await expect(suggestQuickBookAction({ x: 1 })).resolves.toEqual({
      ok: true,
      suggestions: [],
    });
    expect(quickBookModule.suggestQuickBook).toHaveBeenCalledWith({}, { x: 1 });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("undoAction", () => {
  it("is forbidden when logged out", async () => {
    actor.current = null;
    await expect(undoAction({ entryId: 1 })).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(undoModule.undoEntry).not.toHaveBeenCalled();
  });

  it("passes the session's id and role, never the client's", async () => {
    actor.current = staff;
    await expect(undoAction({ entryId: 1, role: "admin" })).resolves.toEqual({ ok: true });
    expect(undoModule.undoEntry).toHaveBeenCalledWith(
      {},
      { id: "u1", role: "staff" },
      { entryId: 1, role: "admin" },
    );
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("leaves the cache alone when the undo is refused", async () => {
    actor.current = staff;
    undoModule.undoEntry.mockResolvedValueOnce({ ok: false, error: "changed" } as never);
    await expect(undoAction({ entryId: 1 })).resolves.toEqual({ ok: false, error: "changed" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
