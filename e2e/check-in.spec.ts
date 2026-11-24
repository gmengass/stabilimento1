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

// The other specs that book on today's map take the first free umbrella, so this one takes the
// last: two specs never read the same umbrella while the other is still booking it.
async function lastFree(page: Page): Promise<string> {
  const free = page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") })
    .last();
  return (await free.locator("span[aria-hidden]").first().innerText()).trim();
}

test("staff check a booking in from the map and can take it back", async ({ page }) => {
  const customer = `Check-in ${Date.now()}`;
  await page.goto("/");
  const number = await lastFree(page);
  const panel = page.locator("aside");
  await spotButton(page, number).click();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.getByTestId("booking-check-in").uncheck();
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  // Wait for the map to show the booking: a live update from another worker can otherwise leave
  // the tile looking free, and the click would start a new booking instead.
  await expect(spotButton(page, number).locator("span.truncate")).toHaveText(customer);
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
  const number = await lastFree(page);
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
  const number = await lastFree(page);
  const panel = page.locator("aside");
  await spotButton(page, number).click();
  await expect(panel.getByTestId("booking-check-in")).toBeVisible();
  // The booking days are Europe/Rome dates (ADR 0004), which differ from UTC late in the evening:
  // take the day after the form's own start date, not after the runner's UTC date.
  const start = await panel.locator('input[name="startDate"]').inputValue();
  const next = new Date(`${start}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  await panel.locator('input[name="endDate"]').fill(next.toISOString().slice(0, 10));
  await expect(panel.getByTestId("booking-check-in")).toHaveCount(0);
});
