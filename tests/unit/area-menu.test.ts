// @vitest-environment jsdom
import { createElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { axe } from "vitest-axe";
import messages from "../../messages/en.json";

const nav = vi.hoisted(() => ({ pathname: "/", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ refresh: () => undefined }),
}));

import { AreaMenu } from "@/components/area-menu";
import { pickArea, rememberAreaCookie } from "@/lib/beach/area-cookie";

const areas = [
  { id: 1, name: "Spiaggia principale" },
  { id: 2, name: "Lato pineta" },
];

// createElement's overloads reject components that need children; pass them variadically.
const h = createElement as unknown as (
  type: unknown,
  props: unknown,
  ...children: unknown[]
) => ReactElement;

function menu(props: { areas?: typeof areas; remembered?: string | null } = {}) {
  return h(
    NextIntlClientProvider,
    { locale: "en", messages },
    h(AreaMenu, {
      areas: props.areas ?? areas,
      remembered: props.remembered ?? null,
      logo: null,
    }),
  );
}

function at(pathname: string, search = "") {
  nav.pathname = pathname;
  nav.search = search;
}

const mapLink = () => screen.getByTestId("area-menu-map");
const toggle = () => screen.getByRole("button", { name: "Choose the beach space" });

function clearCookie() {
  document.cookie = "area=; Path=/; Max-Age=0";
}

beforeEach(() => {
  at("/");
  clearCookie();
});

afterEach(cleanup);

describe("pickArea", () => {
  it("prefers the space in the URL", () => {
    expect(pickArea(areas, "2", "1")?.id).toBe(2);
  });

  it("uses the remembered space when the URL has none", () => {
    expect(pickArea(areas, null, "2")?.id).toBe(2);
  });

  it.each([
    ["99", "2", 2],
    [null, "99", 1],
    ["abc", "x1", 1],
    ["abc", "2", 2],
    [null, "2.5", 1],
    ["", "", 1],
  ])("skips ids that match no space (url %o, cookie %o)", (url, cookie, expected) => {
    expect(pickArea(areas, url, cookie)?.id).toBe(expected);
  });

  it("is undefined with no spaces", () => {
    expect(pickArea([], "1", "1")).toBeUndefined();
  });
});

describe("rememberAreaCookie", () => {
  it("keeps the space for a year, site-wide", () => {
    expect(rememberAreaCookie(2, false)).toBe("area=2; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it("is Secure over https", () => {
    expect(rememberAreaCookie(2, true)).toMatch(/; Secure$/);
  });
});

describe("AreaMenu", () => {
  it("with one space is the plain map link, no menu", () => {
    render(menu({ areas: [areas[0]!] }));
    const link = screen.getByRole("link", { name: "Beach map" });
    expect(link.getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("names the space in the URL and links to it, keeping the day", () => {
    at("/", "area=2&date=2027-07-01");
    render(menu({ remembered: "1" }));
    expect(mapLink().textContent).toContain("Lato pineta");
    expect(mapLink().getAttribute("href")).toBe("/?area=2&date=2027-07-01");
  });

  it("lists every space; the current one is marked, the others keep the day", () => {
    at("/", "area=2&date=2027-07-01");
    render(menu());
    const list = document.getElementById(toggle().getAttribute("aria-controls")!)!;
    expect(list.getAttribute("aria-label")).toBe("Beach spaces");
    expect(list.hidden).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle());
    expect(list.hidden).toBe(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const current = within(list).getByRole("link", { current: "page" });
    expect(current.textContent).toBe("Lato pineta");
    const other = within(list).getByRole("link", { name: "Spiaggia principale" });
    expect(other.getAttribute("href")).toBe("/?area=1&date=2027-07-01");

    fireEvent.click(other);
    expect(list.hidden).toBe(true);
  });

  it("closes on Escape and gives focus back to the button", () => {
    render(menu());
    fireEvent.click(toggle());
    const list = screen.getByRole("navigation", { name: "Beach spaces" });
    fireEvent.keyDown(list, { key: "Escape" });
    expect(list.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it("remembers the space viewed on the map in a cookie", () => {
    at("/", "area=2");
    render(menu());
    expect(document.cookie).toContain("area=2");
  });

  it("off the map, shows the space last viewed and drops the day", () => {
    at("/admin/seasons", "date=2027-07-01");
    render(menu({ remembered: "2" }));
    expect(mapLink().textContent).toContain("Lato pineta");
    expect(mapLink().getAttribute("href")).toBe("/?area=2");
    expect(document.cookie).not.toContain("area=");
  });

  it("keeps the space just viewed after leaving the map (the layout isn't re-rendered)", () => {
    at("/", "area=2");
    const { rerender } = render(menu({ remembered: "1" }));
    at("/admin/seasons");
    rerender(menu({ remembered: "1" }));
    expect(mapLink().textContent).toContain("Lato pineta");
  });

  it("has no axe violations, open or closed", async () => {
    const { container } = render(menu());
    expect((await axe(container)).violations).toEqual([]);
    fireEvent.click(toggle());
    expect((await axe(container)).violations).toEqual([]);
  });
});
