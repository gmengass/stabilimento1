// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";

vi.mock("@/app/(app)/booking-actions", () => ({
  createBookingAction: () => undefined,
  createSeasonPassAction: () => undefined,
  endSeasonPassAction: () => undefined,
  moveBookingAction: () => undefined,
  releaseDaysAction: () => undefined,
  restoreDaysAction: () => undefined,
  restoreNoShowAction: () => undefined,
  setHoldAction: () => undefined,
  suggestQuickBookAction: () => undefined,
  uncheckAction: () => undefined,
  undoAction: () => undefined,
}));

import { BeachBoard } from "@/app/(app)/beach-board";

// The live map refreshes the page's data under a board the user is working in (ADR 0019).

const spot = (id: number) =>
  ({ id, number: id, position: id, kind: "umbrella", includedSunbeds: 2, maxSunbeds: 4 }) as never;
const lines = [{ number: 1, spots: [spot(1), spot(2), spot(3)] }];

const occupant = (bookingId: number, spotId: number) => ({
  bookingId,
  kind: "day",
  customerName: "Rossi",
  customerPhone: null,
  startDate: "2026-11-19",
  endDate: "2026-11-19",
  notes: "",
  releasedDays: 0,
  spots: [{ spotId, number: spotId, sunbeds: 2 }],
  deckchairs: 0,
  checkedIn: false,
  holdUntil: null,
  holdTime: "11:00",
  usualHoldTime: "11:00",
});

function board(occupancy: Record<number, unknown>, date = "2026-11-19") {
  const children = createElement(BeachBoard, {
    today: "2026-11-19",
    areaId: 1,
    areaName: "Sea",
    date,
    lines,
    occupancy: occupancy as never,
    released: {},
    noShows: {},
    openSeason: null,
  });
  return createElement(NextIntlClientProvider, { locale: "en", messages } as never, children);
}

const spotButtons = () => [...screen.getByTestId("beach-map").querySelectorAll("button")];
const pressed = () =>
  spotButtons().flatMap((b, i) => (b.getAttribute("aria-pressed") === "true" ? [i + 1] : []));
const tap = (n: number) => fireEvent.click(spotButtons()[n - 1]);
const notice = () => screen.queryByTestId("live-panel-notice")?.textContent ?? null;

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as never;
Element.prototype.scrollIntoView = () => {};
afterEach(cleanup);

describe("a spot picked, then booked elsewhere", () => {
  it("is dropped with a notice, and does not come back when freed again", () => {
    const view = render(board({}));
    tap(1);
    tap(2);
    view.rerender(board({ 1: occupant(10, 1) }));
    expect(pressed()).toEqual([2]);
    expect(notice()).toMatch(/booked elsewhere/);

    view.rerender(board({}));
    expect(pressed()).toEqual([2]);
  });

  it("says so when the whole selection goes", () => {
    const view = render(board({}));
    tap(1);
    view.rerender(board({ 1: occupant(10, 1) }));
    expect(pressed()).toEqual([]);
    expect(notice()).toMatch(/booked elsewhere/);
  });

  it("stays quiet when the day changes under the selection", () => {
    const view = render(board({}));
    tap(1);
    view.rerender(board({ 1: occupant(10, 1) }, "2026-11-20"));
    expect(notice()).toBeNull();
  });
});

describe("an open booking changed elsewhere", () => {
  it("clears a move in progress, with no phantom targets, and says so", () => {
    const view = render(board({ 1: occupant(10, 1) }));
    tap(1);
    fireEvent.click(screen.getByRole("button", { name: /move/i }));
    tap(2);
    expect(pressed()).toEqual([1, 2]);

    view.rerender(board({}));
    expect(pressed()).toEqual([]);
    expect(notice()).toMatch(/changed elsewhere/);
  });

  it("drops a move target that someone else took", () => {
    const view = render(board({ 1: occupant(10, 1) }));
    tap(1);
    fireEvent.click(screen.getByRole("button", { name: /move/i }));
    tap(2);

    view.rerender(board({ 1: occupant(10, 1), 2: occupant(11, 2) }));
    expect(pressed()).toEqual([1]);
    expect(notice()).toMatch(/changed elsewhere/);
  });

  it("shows no notice when the user closes the panel and the booking is then gone", () => {
    const view = render(board({ 1: occupant(10, 1) }));
    tap(1);
    expect(notice()).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^close$/i })[0] ?? document.body);
    view.rerender(board({}));
    expect(notice()).toBeNull();
  });
});
