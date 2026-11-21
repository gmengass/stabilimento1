import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// WCAG checks in a real browser, which also covers contrast and target size (jsdom cannot).
// Read-only: it opens screens but books nothing, and reuses the admin's saved session.
// Screen readers are out of scope (docs/plans/accessibility.md), so only these rule sets run.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };
const REFLOW = { width: 320, height: 640 };

const PAGES = [
  { name: "map", path: "/" },
  { name: "search", path: "/search" },
  { name: "beach settings", path: "/admin/beach" },
  { name: "seasons", path: "/admin/seasons" },
  { name: "staff", path: "/admin/staff" },
];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
  }));
}

for (const scheme of ["light", "dark"] as const) {
  for (const [device, viewport] of [
    ["tablet", TABLET],
    ["phone", PHONE],
  ] as const) {
    test.describe(`${scheme}, ${device}`, () => {
      test.use({ storageState: ADMIN_STATE, colorScheme: scheme, viewport });

      for (const { name, path } of PAGES) {
        test(`${name} has no WCAG violations`, async ({ page }) => {
          await page.goto(path);
          await page.locator("main").waitFor();
          expect(await violations(page)).toEqual([]);
        });
      }

      test("the booking panel has no WCAG violations", async ({ page }) => {
        await page.goto("/");
        await page.locator("[data-spot-id]").first().click();
        await page.getByRole("complementary").waitFor();
        expect(await violations(page)).toEqual([]);
      });
    });
  }
}

test.describe("login page", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: PHONE });

  test("has no WCAG violations", async ({ page }) => {
    await page.goto("/login");
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("reflow at 320px wide (WCAG 1.4.10)", () => {
  test.use({ storageState: ADMIN_STATE, viewport: REFLOW });

  for (const { name, path } of PAGES) {
    test(`${name} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      await page.locator("main").waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
