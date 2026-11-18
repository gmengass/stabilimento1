import { expect, test } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// A phone, a portrait tablet, a landscape tablet, a desktop.
const WIDTHS = [390, 768, 1024, 1440];

// en-US fixes the date field's typing order: month, day, year.
test.use({ storageState: ADMIN_STATE, locale: "en-US" });

test("the date controls stay on one line at every width", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByTestId("date-nav");
  await expect(nav).toBeVisible();
  const controls = nav.locator(":scope > a, :scope > label");
  await expect(controls).toHaveCount(4);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const rows = await controls.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
    const [first] = rows;
    for (const row of rows) {
      expect(row.top, `overlaps the first control's row at ${width}px`).toBeLessThan(first.bottom);
      expect(row.bottom, `overlaps the first control's row at ${width}px`).toBeGreaterThan(
        first.top,
      );
    }
    const navRight = await nav.evaluate((el) => el.getBoundingClientRect().right);
    expect(navRight, `date controls overflow the screen at ${width}px`).toBeLessThanOrEqual(width);
  }
});

test("picking a calendar day opens it at once, and Today stands out until you go back", async ({
  page,
}) => {
  await page.goto("/");
  const goToToday = page.getByTestId("go-to-today");
  await expect(goToToday).toHaveCount(0);
  const nav = page.getByTestId("date-nav");
  await expect(nav.getByRole("link", { name: /^Oggi: \d{1,2} \p{L}+ \d{4}$/u })).toBeVisible();
  await expect(nav.locator("label")).toHaveText("Calendario");

  const day = "2090-07-10";
  await page.getByTestId("date-nav").locator('input[type="date"]').fill(day);
  await page.waitForURL(new RegExp(`date=${day}`));
  await expect(goToToday).toBeVisible();
  // The day being viewed is never hidden: the calendar button names it.
  await expect(nav.locator("label")).toHaveText("10 luglio 2090");

  await goToToday.click();
  await page.waitForURL((url) => !url.searchParams.has("date"));
  await expect(goToToday).toHaveCount(0);
});

test("a typed date opens only on Enter, never half-typed", async ({ page }) => {
  await page.goto("/");
  const field = page.getByTestId("date-nav").locator('input[type="date"]');
  await field.focus();
  await page.keyboard.type("07102090");
  // A navigation would start within a moment of the last key: give it the chance to.
  await page.waitForTimeout(1000);
  await expect(page).not.toHaveURL(/date=/);

  await page.keyboard.press("Enter");
  await page.waitForURL(/date=2090-07-10/);
});
