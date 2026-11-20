// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { axe } from "vitest-axe";
import en from "../../messages/en.json";
import itMessages from "../../messages/it.json";

vi.mock("@/app/(app)/booking-actions", () => ({}));

import { BeachBoard } from "@/app/(app)/beach-board";
import { LoginForm } from "@/app/login/login-form";

// jsdom has no layout, so contrast and target size are not checked here (e2e axe and the
// token test cover them). This catches names, roles, labels and ARIA misuse. Not covered yet:
// open booking panel, acting dialog, admin forms (see docs/plans/accessibility.md).

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

  it("login form has no violations", async () => {
    const { container } = render(wrap(createElement(LoginForm)));
    expect((await check(container)).violations).toEqual([]);
  });
});
