// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";

vi.mock("@/app/(app)/booking-actions", () => ({}));

import { BeachBoard } from "@/app/(app)/beach-board";

// Sunbeds and deckchairs that differ from the default show on the tile (ADR 0023).

const spot = (id: number) =>
  ({
    id,
    number: 100 + id,
    position: id,
    kind: "umbrella",
    includedSunbeds: 2,
    maxSunbeds: 4,
  }) as never;
const lines = [{ number: 1, spots: [spot(1), spot(2), spot(3)] }];

const booking = (bookingId: number, sunbeds: number[], deckchairs: number) => {
  const spots = sunbeds.map((n, i) => ({
    spotId: bookingId + i,
    number: 100 + bookingId + i,
    sunbeds: n,
  }));
  return Object.fromEntries(
    spots.map((s) => [
      s.spotId,
      {
        bookingId,
        kind: "day",
        customerName: "Rossi",
        customerPhone: null,
        startDate: "2026-11-19",
        endDate: "2026-11-19",
        notes: "",
        releasedDays: 0,
        spots,
        deckchairs,
        checkedIn: false,
        holdUntil: null,
        holdTime: "11:00",
        usualHoldTime: "11:00",
        price: { suggestion: null, paid: null },
      },
    ]),
  );
};

function renderBoard(occupancy: Record<number, unknown>) {
  const board = createElement(BeachBoard, {
    today: "2026-11-19",
    areaId: 1,
    areaName: "Sea",
    date: "2026-11-19",
    lines,
    occupancy: occupancy as never,
    released: {},
    noShows: {},
    openSeason: null,
  });
  render(createElement(NextIntlClientProvider, { locale: "en", messages } as never, board));
}

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as never;
Element.prototype.scrollIntoView = () => {};
afterEach(cleanup);

const marks = () =>
  [...screen.getByTestId("beach-map").querySelectorAll("[data-testid='tile-extras']")].map(
    (el) => el.textContent,
  );

describe("tile extras", () => {
  it("shows nothing for a default booking", () => {
    renderBoard(booking(1, [2], 0));
    expect(marks()).toEqual([]);
  });

  it("shows +L, -L and -L +S on single-umbrella bookings", () => {
    renderBoard({ ...booking(1, [3], 0), ...booking(2, [1], 0), ...booking(3, [1], 1) });
    expect(marks()).toEqual(["+L", "-L", "-L +S"]);
  });

  it("puts the booking's deckchairs on its first umbrella only", () => {
    renderBoard(booking(1, [2, 3], 2));
    expect(marks()).toEqual(["+2S", "+L"]);
  });

  it("describes the mark to screen readers", () => {
    renderBoard(booking(1, [1], 1));
    expect(screen.getByText(/1 sunbed fewer/)).toBeTruthy();
    expect(screen.getByText(/1 deckchair/)).toBeTruthy();
  });
});
