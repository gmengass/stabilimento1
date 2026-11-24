import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// One umbrella: sunbeds and deckchairs share its row, and the number moves above when the panel
// is too narrow. Several umbrellas: deckchairs get their own line. A far-off date of its own.
test.use({ storageState: ADMIN_STATE });

const DAY = "2098-07-01";
const tiles = (page: Page) => page.getByTestId("beach-map").locator("ol button");
const row = (page: Page) => page.locator("aside form ul li").first();

async function topOf(page: Page, selector: string) {
  return (await row(page).locator(selector).first().boundingBox())!.y;
}

test("one umbrella on a tablet: deckchairs on its row, number above", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/?date=${DAY}`);
  await tiles(page).first().click();
  await expect(row(page).getByTestId("booking-deckchairs")).toBeVisible();
  expect(await topOf(page, "span")).toBeLessThan(await topOf(page, "select"));
});

test("one umbrella on a phone: everything on one line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?date=${DAY}`);
  await tiles(page).first().click();
  await expect(row(page).getByTestId("booking-deckchairs")).toBeVisible();
  const select = await row(page).locator("select").first().boundingBox();
  const number = await row(page).locator("span").first().boundingBox();
  expect(number!.y + number!.height).toBeGreaterThan(select!.y);
});

test("two umbrellas: deckchairs once, below the rows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/?date=${DAY}`);
  await tiles(page).nth(0).click();
  await tiles(page).nth(1).click();
  await expect(page.locator("aside form ul li")).toHaveCount(2);
  await expect(page.getByTestId("booking-deckchairs")).toHaveCount(1);
  await expect(page.locator("aside form ul").getByTestId("booking-deckchairs")).toHaveCount(0);
});
