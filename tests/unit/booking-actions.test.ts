import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { actor, bookingsModule, passesModule, quickBookModule, cache } = vi.hoisted(() => ({
  actor: { current: null as CurrentUser | null },
  bookingsModule: {
    createBooking: vi.fn(async () => ({ ok: true as const, bookingId: 1 })),
    cancelBooking: vi.fn(async () => ({ ok: true as const })),
  },
  passesModule: {
    createSeasonPass: vi.fn(async () => ({ ok: true as const, bookingId: 2 })),
    releaseDays: vi.fn(async () => ({ ok: true as const, days: 1 })),
    restoreDays: vi.fn(async () => ({ ok: true as const, days: 1 })),
    endSeasonPass: vi.fn(async () => ({ ok: true as const })),
  },
  quickBookModule: {
    suggestQuickBook: vi.fn(async () => ({ ok: true as const, suggestions: [] })),
  },
  cache: { revalidatePath: vi.fn() },
}));

vi.mock("@/lib/auth/session", () => ({ readCurrentUser: vi.fn(async () => actor.current) }));
vi.mock("@/lib/booking/bookings", () => bookingsModule);
vi.mock("@/lib/booking/passes", () => passesModule);
vi.mock("@/lib/booking/quick-book", () => quickBookModule);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/cache", () => cache);

const {
  createBookingAction,
  cancelBookingAction,
  createSeasonPassAction,
  releaseDaysAction,
  restoreDaysAction,
  endSeasonPassAction,
  suggestQuickBookAction,
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
  ["createSeasonPassAction", createSeasonPassAction, passesModule.createSeasonPass],
] as const;

const dayActions = [
  ["releaseDaysAction", releaseDaysAction, passesModule.releaseDays],
  ["restoreDaysAction", restoreDaysAction, passesModule.restoreDays],
  ["endSeasonPassAction", endSeasonPassAction, passesModule.endSeasonPass],
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

  it("runs for staff", async () => {
    actor.current = staff;
    await expect(action({ x: 1 })).resolves.toMatchObject({ ok: true });
    expect(operation).toHaveBeenCalledWith({}, { x: 1 });
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
