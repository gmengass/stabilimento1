import { describe, expect, it } from "vitest";
import { initialPanel } from "@/app/(app)/initial-panel";
import type { MapLine, MapSpot } from "@/lib/beach/layout";
import type { Occupant } from "@/lib/booking/bookings";

const spot = (id: number): MapSpot => ({
  id,
  number: 100 + id,
  position: id,
  kind: "umbrella",
  includedSunbeds: 2,
  maxSunbeds: 3,
});
const lines: MapLine[] = [{ number: 1, spots: [spot(1), spot(2), spot(3)] }];

const occupant = (bookingId: number): Occupant => ({
  bookingId,
  kind: "multi_day",
  customerName: "Rossi",
  customerPhone: null,
  startDate: "2027-06-20",
  endDate: "2027-06-21",
  notes: "",
  releasedDays: 0,
  spots: [],
  checkedIn: false,
  holdUntil: null,
  holdTime: "11:00",
  usualHoldTime: "11:00",
});

describe("initialPanel", () => {
  it("opens nothing without a booking", () => {
    expect(initialPanel(lines, { 1: occupant(7) }, {}, null)).toEqual({
      openBooking: null,
      selected: [],
    });
  });

  it("opens the panel of a booking on the map, with nothing selected", () => {
    const noShows = { 2: occupant(7) };
    expect(initialPanel(lines, { 1: occupant(7) }, noShows, 7)).toEqual({
      openBooking: 7,
      selected: [],
    });
  });

  it("selects a no-show's free umbrellas, so its restore box shows", () => {
    const noShows = { 1: occupant(7), 2: occupant(7), 3: occupant(8) };
    const occupancy = { 2: occupant(9) };
    expect(initialPanel(lines, occupancy, noShows, 7)).toEqual({
      openBooking: null,
      selected: [spot(1)],
    });
  });

  it("opens nothing for a booking not on this day", () => {
    expect(initialPanel(lines, { 1: occupant(7) }, {}, 42)).toEqual({
      openBooking: null,
      selected: [],
    });
  });
});
