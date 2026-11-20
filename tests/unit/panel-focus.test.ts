// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";

vi.mock("@/app/(app)/booking-actions", () => ({}));

import { BeachBoard } from "@/app/(app)/beach-board";

// On a phone the booking panel is a bottom sheet: focus moves into it and returns to the tile.

const spot = (id: number) =>
  ({ id, number: id, position: id, kind: "umbrella", includedSunbeds: 2, maxSunbeds: 4 }) as never;
const lines = [{ number: 1, spots: [spot(1), spot(2)] }];

const booking = {
  bookingId: 10,
  kind: "day",
  customerName: "Rossi",
  customerPhone: null,
  startDate: "2026-11-19",
  endDate: "2026-11-19",
  notes: "",
  releasedDays: 0,
  spots: [{ spotId: 2, number: 2, sunbeds: 2 }],
  deckchairs: 0,
  checkedIn: false,
  holdUntil: null,
  holdTime: "11:00",
  usualHoldTime: "11:00",
};

const boardFor = (occupancy: Record<number, unknown>) =>
  createElement(
    NextIntlClientProvider,
    { locale: "en", messages } as never,
    createElement(BeachBoard, {
      today: "2026-11-19",
      areaId: 1,
      areaName: "Sea",
      date: "2026-11-19",
      lines,
      occupancy: occupancy as never,
      released: {},
      noShows: {},
      openSeason: null,
    }),
  );

function renderBoard(occupancy: Record<number, unknown> = { 2: booking }) {
  return render(boardFor(occupancy));
}

const tile = (id: number) =>
  screen.getByTestId("beach-map").querySelector<HTMLElement>(`[data-spot-id="${id}"]`)!;

function setPhone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as never;
}

Element.prototype.scrollIntoView = () => {};
afterEach(cleanup);

describe("booking panel as a phone sheet", () => {
  it("moves focus into the sheet when a booking opens", () => {
    setPhone(true);
    renderBoard();
    fireEvent.click(tile(2));
    expect(document.activeElement).toBe(document.querySelector("[data-sheet-toggle]"));
  });

  it("returns focus to the tile it was opened from on Close", () => {
    setPhone(true);
    renderBoard();
    fireEvent.click(tile(2));
    fireEvent.click(document.querySelector("[data-sheet-close]")!);
    expect(document.activeElement).toBe(tile(2));
  });

  it("returns focus to the tile on Escape", () => {
    setPhone(true);
    renderBoard();
    fireEvent.click(tile(2));
    fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" });
    expect(document.activeElement).toBe(tile(2));
  });

  it("does not steal focus on wider screens", () => {
    setPhone(false);
    renderBoard();
    tile(2).focus();
    fireEvent.click(tile(2));
    expect(document.activeElement).toBe(tile(2));
  });

  it("keeps focus on the map while umbrellas are still being picked", () => {
    setPhone(true);
    renderBoard();
    tile(1).focus();
    fireEvent.click(tile(1));
    expect(document.activeElement).toBe(tile(1));
  });

  it("does not take focus back on a live refresh of an open sheet", () => {
    setPhone(true);
    const view = renderBoard();
    fireEvent.click(tile(2));
    tile(1).focus();
    view.rerender(boardFor({ 2: { ...booking } }));
    expect(document.activeElement).toBe(tile(1));
  });

  it("returns to Quick book, not an old tile, after Quick book is closed", () => {
    setPhone(true);
    renderBoard();
    fireEvent.click(tile(2));
    fireEvent.click(document.querySelector("[data-sheet-close]")!);
    fireEvent.click(screen.getByTestId("quick-book-open"));
    fireEvent.click(document.querySelector("[data-sheet-close]")!);
    expect(document.activeElement).toBe(screen.getByTestId("quick-book-open"));
  });

  it("falls back to Quick book when the booking is cancelled elsewhere and its tile is gone", () => {
    setPhone(true);
    const view = renderBoard();
    fireEvent.click(tile(2));
    view.rerender(boardFor({}));
    view.rerender(boardFor({}));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });
});
