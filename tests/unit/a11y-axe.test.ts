// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { axe } from "vitest-axe";
import en from "../../messages/en.json";
import itMessages from "../../messages/it.json";

vi.mock("@/app/(app)/booking-actions", () => ({}));
vi.mock("@/app/(app)/acting-actions", () => ({
  chooseActingAction: async () => ({ ok: true }),
  clearActingAction: async () => ({ ok: true }),
}));

import { BeachBoard } from "@/app/(app)/beach-board";
import { LoginForm } from "@/app/login/login-form";
import { ActingProvider, useActing } from "@/components/acting";

// jsdom has no layout, so contrast and target size are not checked here (e2e axe and the
// token test cover them). This catches names, roles, labels and ARIA misuse. Not covered yet:
// admin forms (see docs/plans/accessibility.md).

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

const booking = {
  bookingId: 1,
  kind: "day",
  customerName: "Rossi",
  customerPhone: null,
  startDate: "2026-11-19",
  endDate: "2026-11-19",
  notes: "",
  releasedDays: 0,
  spots: [{ spotId: 1, number: 101, sunbeds: 3 }],
  deckchairs: 1,
  checkedIn: false,
  holdUntil: null,
  holdTime: "11:00",
  usualHoldTime: "11:00",
};

const locales = [
  ["en", en],
  ["it", itMessages],
] as const;

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as never;
Element.prototype.scrollIntoView = () => {};
HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute("open", "");
};
afterEach(cleanup);

const check = (container: HTMLElement) =>
  axe(container, { rules: { "color-contrast": { enabled: false } } });

describe.each(locales)("axe (%s)", (locale, messages) => {
  const wrap = (child: unknown) =>
    createElement(NextIntlClientProvider, { locale, messages } as never, child as never);

  it("beach board has no violations", async () => {
    const board = createElement(BeachBoard, {
      today: "2026-11-19",
      areaId: 1,
      areaName: "Sea",
      date: "2026-11-19",
      lines,
      occupancy: { 1: booking } as never,
      released: {},
      noShows: {},
      openSeason: null,
    });
    const { container } = render(wrap(board));
    expect((await check(container)).violations).toEqual([]);
  });

  const boardWith = (occupancy: unknown) =>
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
    });
  const tile = (container: HTMLElement, id: number) =>
    container.querySelector<HTMLElement>(`[data-spot-id="${id}"]`)!;

  it("open booking panel has no violations", async () => {
    const { container } = render(wrap(boardWith({ 1: booking })));
    fireEvent.click(tile(container, 1));
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect((await check(container)).violations).toEqual([]);
  });

  it("new booking panel has no violations", async () => {
    const { container } = render(wrap(boardWith({ 1: booking })));
    fireEvent.click(tile(container, 2));
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect((await check(container)).violations).toEqual([]);
  });

  it("quick book panel has no violations", async () => {
    const { container } = render(wrap(boardWith({})));
    fireEvent.click(screen.getByTestId("quick-book-open"));
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect((await check(container)).violations).toEqual([]);
  });

  it("who-is-doing-this dialog has no violations", async () => {
    function Open() {
      const { run } = useActing();
      return createElement(
        "button",
        { onClick: () => void run(async () => ({ ok: false, error: "needsActor" })) },
        "go",
      );
    }
    const acting = createElement(
      ActingProvider as never,
      { communal: true, choices: [{ id: "a1", name: "Anna" }], initialName: null } as never,
      createElement(Open),
    );
    const { container } = render(wrap(acting));
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(screen.getByTestId("acting-dialog")).toBeTruthy());
    expect((await check(container)).violations).toEqual([]);
  });

  it("login form has no violations", async () => {
    const { container } = render(wrap(createElement(LoginForm)));
    expect((await check(container)).violations).toEqual([]);
  });
});
