import { expect, test, type Locator, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// Day colours on the date controls and the "you're looking at" strip (src/app/(app)/day-tone.tsx).
test.use({ storageState: ADMIN_STATE, viewport: { width: 1280, height: 900 } });

const GREEN = "rgb(31, 61, 43)";
const ORANGE = "rgb(232, 134, 42)";
const SAND_PAST = "rgb(236, 228, 211)";
const YELLOW = "rgb(255, 195, 0)";
const PEACH = "rgb(253, 231, 207)";

const colours = (el: Locator) =>
  el.evaluate((node) => {
    const s = getComputedStyle(node);
    return { background: s.backgroundColor, border: s.borderTopColor };
  });

const goTo = (page: Page, label: RegExp) =>
  page.getByTestId("date-nav").getByRole("link", { name: label }).click();

test("the strip names the day being viewed, and never shows on today", async ({ page }) => {
  await page.goto("/");
  const strip = page.getByTestId("day-strip");
  await expect(strip).toHaveCount(0);

  await goTo(page, /Giorno dopo/);
  await page.waitForURL(/date=/);
  await expect(strip).toHaveAttribute("data-tone", "future");
  await expect(strip).toHaveText(/^Stai guardando \p{L}+ \d{1,2} \p{L}{3} \d{4} \(domani\)$/u);

  await goTo(page, /Giorno dopo/);
  await expect(strip).toHaveText(/\(tra 2 giorni\)$/);

  await page.goto("/");
  await goTo(page, /Giorno prima/);
  await page.waitForURL(/date=/);
  await expect(strip).toHaveAttribute("data-tone", "past");
  await expect(strip).toHaveText(/\(ieri\)$/);

  await goTo(page, /Giorno prima/);
  await expect(strip).toHaveText(/\(2 giorni fa\)$/);

  await page.getByTestId("go-to-today").click();
  await page.waitForURL((url) => !url.searchParams.has("date"));
  await expect(strip).toHaveCount(0);
});

test.describe("Arturo theme", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "theme", value: "arturo", url: baseURL! }]);
  });

  test("past is sand, today green, ahead orange; the calendar takes the day's colour", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByTestId("date-nav");
    const calendar = nav.locator("label");

    expect(await colours(nav.getByRole("link", { name: /Giorno prima/ }))).toMatchObject({
      background: SAND_PAST,
    });
    expect(await colours(nav.getByRole("link", { name: /^Oggi:/ }))).toMatchObject({
      background: GREEN,
    });
    expect(await colours(nav.getByRole("link", { name: /Giorno dopo/ }))).toMatchObject({
      border: ORANGE,
    });
    expect(await calendar.locator("svg").evaluate((el) => getComputedStyle(el).color)).toBe(GREEN);

    await goTo(page, /Giorno dopo/);
    await page.waitForURL(/date=/);
    expect(await colours(page.getByTestId("go-to-today"))).toMatchObject({ background: YELLOW });
    expect(await colours(calendar)).toEqual({ background: PEACH, border: ORANGE });
    expect(await colours(page.getByTestId("day-strip"))).toMatchObject({ background: PEACH });

    await page.goto("/");
    await goTo(page, /Giorno prima/);
    await page.waitForURL(/date=/);
    expect(await colours(calendar)).toMatchObject({ background: SAND_PAST });
  });
});
