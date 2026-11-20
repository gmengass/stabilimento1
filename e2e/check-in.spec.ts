import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// Check-in is for today only, so this spec books today (other specs use far-off years). The job
// never flags a booking made after the hold time, and one made before it only at 11:00 Rome, so
// only a run crossing 11:00 within these few seconds could see it flagged.
// Selectors avoid translated text: another test switches the shared admin's language.

test.use({ storageState: ADMIN_STATE });

function spotButton(page: Page, number: string) {
  const label = page.locator("span[aria-hidden]", { hasText: new RegExp(`^${number}$`) });
  return page.getByTestId("beach-map").locator("ol button", { has: label });
}

async function firstFree(page: Page): Promise<string> {
  const free = page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") })
    .first();
  return (await free.locator("span[aria-hidden]").first().innerText()).trim();
}

test("staff check a booking in from the map and can take it back", async ({ page }) => {
  const customer = `Check-in ${Date.now()}`;
  await page.goto("/");
  const number = await firstFree(page);
  const panel = page.locator("aside");
  await spotButton(page, number).click();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.getByTestId("booking-check-in").uncheck();
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  await spotButton(page, number).click();
  await panel.getByTestId("check-in").click();
  await expect(panel.getByTestId("uncheck")).toBeVisible();
  await expect(spotButton(page, number).locator("span[aria-hidden]", { hasText: "✓" })).toHaveCount(
    1,
  );
  await expect(page.getByTestId("activity").locator("li").first()).toContainText(customer);

  await panel.getByTestId("uncheck").click();
  await expect(panel.getByTestId("check-in")).toBeVisible();
  await expect(spotButton(page, number).locator("span[aria-hidden]", { hasText: "✓" })).toHaveCount(
    0,
  );
});

test("a one-day booking for today is checked in as it is made", async ({ page }) => {
  const customer = `Walk-in ${Date.now()}`;
  await page.goto("/");
  const number = await firstFree(page);
  const panel = page.locator("aside");
  await spotButton(page, number).click();
  await expect(panel.getByTestId("booking-check-in")).toBeChecked();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  await expect(spotButton(page, number).locator("span[aria-hidden]", { hasText: "✓" })).toHaveCount(
    1,
  );
  await spotButton(page, number).click();
  await expect(panel.getByTestId("uncheck")).toBeVisible();
});

test("the check-in choice is hidden when the booking is not for today alone", async ({ page }) => {
  await page.goto("/");
  const number = await firstFree(page);
  const panel = page.locator("aside");
  await spotButton(page, number).click();
  await expect(panel.getByTestId("booking-check-in")).toBeVisible();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await panel.locator('input[name="endDate"]').fill(tomorrow);
  await expect(panel.getByTestId("booking-check-in")).toHaveCount(0);
});
