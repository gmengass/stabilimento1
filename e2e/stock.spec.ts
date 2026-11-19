import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE, ensureBeach } from "./helpers";

// A year no other spec books in (they use 2090–2093). The stock project runs after the others
// (playwright.config.ts): while a stock is set, their bookings could be warned too.
const DAY = "2094-07-01";

// Selectors avoid translated text: another test switches the shared admin's language.

test.use({ storageState: ADMIN_STATE });

function freeSpot(page: Page) {
  return page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") })
    .first();
}

async function setStock(page: Page, sunbeds: string, deckchairs: string) {
  await page.goto("/admin/beach");
  const form = page.getByTestId("stock-form");
  await form.locator('input[name="sunbedStock"]').fill(sunbeds);
  await form.locator('input[name="deckchairStock"]').fill(deckchairs);
  await form.locator('button[type="submit"]').click();
  await expect(form.getByRole("status")).toBeVisible();
}

test("an admin sets the sunbed stock; a booking over it is warned, then booked anyway", async ({
  page,
}) => {
  await ensureBeach(page);
  try {
    await setStock(page, "1", "");
    await page.reload();
    const form = page.getByTestId("stock-form");
    await expect(form.locator('input[name="sunbedStock"]')).toHaveValue("1");
    await expect(form.locator('input[name="deckchairStock"]')).toHaveValue("");

    await page.goto(`/?date=${DAY}`);
    await expect(page.getByTestId("stock-sunbeds")).toBeVisible();
    await expect(page.getByTestId("stock-deckchairs")).toHaveCount(0);

    const customer = `Stock ${Date.now()}`;
    const panel = page.locator("aside");
    await freeSpot(page).click();
    await panel.locator('input[name="customerName"]').fill(customer);
    const submit = panel.locator('form button[type="submit"]');
    await submit.click();
    await expect(panel.getByTestId("stock-warning")).toBeVisible();

    await submit.click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("beach-map")).toContainText(customer);
    await expect(page.getByTestId("stock-sunbeds")).toContainText("0 / 1");
  } finally {
    await setStock(page, "", "");
  }
  await page.goto(`/?date=${DAY}`);
  await expect(page.getByTestId("stock-sunbeds")).toHaveCount(0);
});
