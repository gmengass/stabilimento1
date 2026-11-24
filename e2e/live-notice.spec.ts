import { expect, test, type Browser, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// Search and admin pages don't refresh under the user: they say something changed elsewhere and
// offer a reload (ADR 0030). A year no other spec books in.
const DAY = "2096-07-01";
const LIVE = { timeout: 5_000 };

async function device(browser: Browser, path: string): Promise<Page> {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await context.newPage();
  await page.goto(path);
  // The stream opens after hydration; give it a moment before the other device writes.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  return page;
}

test("search says bookings changed elsewhere, and a reload shows the new booking", async ({
  browser,
}) => {
  const customer = `Notice ${Date.now()}`;
  const search = await device(
    browser,
    `/search?${new URLSearchParams({ q: customer, date: DAY })}`,
  );
  await expect(search.getByTestId("search-result")).toHaveCount(0);
  const map = await device(browser, `/?date=${DAY}`);

  const panel = map.locator("aside");
  await map
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: map.locator("span.truncate") })
    .first()
    .click();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  const notice = search.getByTestId("live-changed");
  await expect(notice).toBeVisible(LIVE);
  await expect(search.getByTestId("search-result")).toHaveCount(0);
  await notice.getByRole("button").click();
  await expect(search.getByTestId("search-result")).toContainText(customer);
  await expect(search.getByTestId("live-changed")).toHaveCount(0);
  await search.context().close();
  await map.context().close();
});

test("an admin page says the setup changed elsewhere, but not for a booking", async ({
  browser,
}) => {
  const seasons = await device(browser, "/admin/seasons");
  const beach = await device(browser, "/admin/beach");
  const map = await device(browser, `/?date=${DAY}`);

  // A booking is not a setup change.
  const panel = map.locator("aside");
  await map
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: map.locator("span.truncate") })
    .first()
    .click();
  await panel.locator('input[name="customerName"]').fill(`Not setup ${Date.now()}`);
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);
  await seasons.waitForTimeout(2_000);
  await expect(seasons.getByTestId("live-changed")).toHaveCount(0);

  // Saving the venue's name unchanged still writes it: a setup change other specs don't notice.
  const venue = beach.locator('form:has(input[name="venueName"])');
  await venue.locator('button[type="submit"]').click();

  await expect(seasons.getByTestId("live-changed")).toBeVisible(LIVE);
  // The page that saved knows it was its own save.
  await expect(beach.getByTestId("live-changed")).toHaveCount(0);
  await seasons.getByTestId("live-changed").getByRole("button").click();
  await expect(seasons.getByTestId("live-changed")).toHaveCount(0);
  await seasons.context().close();
  await beach.context().close();
  await map.context().close();
});
