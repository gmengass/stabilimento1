import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// Far in the future, never "past", and a year no other spec books in (they use 2090).
const DAY = "2091-07-15";

// Selectors avoid translated text: another test switches the shared admin's language.

test.use({ storageState: ADMIN_STATE });

function spotButton(page: Page, number: string) {
  const label = page.locator("span[aria-hidden]", { hasText: new RegExp(`^${number}$`) });
  return page.locator("ol button", { has: label });
}

test("quick book suggests two umbrellas, selects them on the map and books them", async ({
  page,
}) => {
  const customer = `Quick ${Date.now()}`;
  await page.goto(`/?date=${DAY}`);

  await page.getByTestId("quick-book-open").click();
  await page.locator('input[name="customerName"]').fill(customer);
  await page.getByTestId("quick-book-umbrellas").fill("2");
  await page.getByTestId("quick-book-sunbeds").fill("3");
  await page.getByTestId("quick-book-suggest").click();

  const suggestion = page.getByTestId("quick-book-suggestion").first();
  await expect(suggestion).toBeVisible();
  const numbers = (await suggestion.innerText()).match(/\b\d{3}\b/g) ?? [];
  expect(numbers).toHaveLength(2);
  for (const number of numbers) {
    await expect(spotButton(page, number)).toHaveAttribute("aria-pressed", "true");
  }

  // One tap: quick book carried the name over to the booking form.
  const form = page.locator("form", { has: page.locator('input[name="customerName"]') });
  await expect(form.locator('input[name="customerName"]')).toHaveValue(customer);
  await form.locator('button[type="submit"]').click();
  await expect(form).toHaveCount(0);

  await page.goto(`/?date=${DAY}`);
  for (const number of numbers) {
    await expect(spotButton(page, number)).toContainText(customer);
  }
});

test("quick book asking for more umbrellas than the beach has shows an alert", async ({ page }) => {
  // The e2e beach has 2 lines of 6 umbrellas (helpers.ts ensureBeach).
  await page.goto(`/?date=${DAY}`);

  await page.getByTestId("quick-book-open").click();
  await page.locator('input[name="customerName"]').fill("Too many");
  await page.getByTestId("quick-book-umbrellas").fill("20");
  await page.getByTestId("quick-book-sunbeds").fill("1");
  await page.getByTestId("quick-book-suggest").click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("quick-book-suggestion")).toHaveCount(0);
});
