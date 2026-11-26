// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ClubLogo } from "@/components/club-logo";
import type { Branding } from "@/lib/branding";

const LIGHT = { width: 800, height: 600, version: "a-1" };
const DARK = { width: 800, height: 600, version: "b-2" };

function images(branding: Branding, backdrop: "page" | "banner", decorative = false) {
  const { container } = render(
    createElement(ClubLogo, { branding, backdrop, className: "h-10", decorative }),
  );
  return [...container.querySelectorAll("img")];
}

afterEach(cleanup);

describe("ClubLogo", () => {
  it("renders nothing without a logo", () => {
    expect(images({ name: "Arturo", light: null, dark: null }, "page")).toHaveLength(0);
  });

  it("with only the normal logo, puts it on a cream backing on dark backdrops", () => {
    const page = images({ name: null, light: LIGHT, dark: null }, "page");
    expect(page).toHaveLength(1);
    expect(page[0].className).toContain("dark:bg-[#fbf6ec]");
    expect(page[0].className).not.toContain("sun:");
    const banner = images({ name: null, light: LIGHT, dark: null }, "banner");
    expect(banner[0].className).toContain("sun:bg-[#fbf6ec]");
  });

  it("with both logos, shows exactly one per backdrop", () => {
    const [pageLight, pageDark] = images({ name: null, light: LIGHT, dark: DARK }, "page");
    expect(pageLight.className).toContain("dark:hidden");
    expect(pageDark.className).toContain("hidden dark:block");
    expect(pageDark.className).not.toContain("sun:");
    const [bannerLight, bannerDark] = images({ name: null, light: LIGHT, dark: DARK }, "banner");
    expect(bannerLight.className).toContain("dark:hidden sun:hidden");
    expect(bannerDark.className).toContain("hidden dark:block sun:block");
  });

  it("uses versioned URLs and the PNG's own size so the page doesn't jump", () => {
    const [light, dark] = images({ name: null, light: LIGHT, dark: DARK }, "page");
    expect(light.getAttribute("src")).toBe("/branding/logo?v=a-1");
    expect(dark.getAttribute("src")).toBe("/branding/logo?v=b-2&variant=dark");
    expect(light.getAttribute("width")).toBe("800");
    expect(light.getAttribute("height")).toBe("600");
    expect(light.className).toContain("max-w-full");
  });

  it("names the club in alt text unless decorative", () => {
    const named = images({ name: "Hotel Residence Arturo", light: LIGHT, dark: DARK }, "page");
    expect(named.map((img) => img.getAttribute("alt"))).toEqual([
      "Hotel Residence Arturo",
      "Hotel Residence Arturo",
    ]);
    const decorative = images(
      { name: "Hotel Residence Arturo", light: LIGHT, dark: null },
      "banner",
      true,
    );
    expect(decorative[0].getAttribute("alt")).toBe("");
    expect(images({ name: null, light: LIGHT, dark: null }, "page")[0].getAttribute("alt")).toBe(
      "",
    );
  });
});
