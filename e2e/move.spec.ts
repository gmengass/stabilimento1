import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// A year no other spec books in (they use 2090–2092), one day per test.
const DAYS = { move: "2093-07-01", undo: "2093-07-02" };

// Selectors avoid translated text: another test switches the shared admin's language.

test.use({ storageState: ADMIN_STATE });

function spotButton(page: Page, number: string) {
  const label = page.locator("span[aria-hidden]", { hasText: new RegExp(`^${number}$`) });
  return page.getByTestId("beach-map").locator("ol button", { has: label });
}

function freeSpots(page: Page) {
  return page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") });
}

async function numberOf(page: Page, index: number): Promise<string> {
  return (await freeSpots(page).nth(index).locator("span[aria-hidden]").first().innerText()).trim();
}

/** Books one free umbrella for the day and moves it to another free one. */
async function bookAndMove(page: Page, date: string, customer: string) {
  await page.goto(`/?date=${date}`);
  const from = await numberOf(page, 0);
  const to = await numberOf(page, 1);
  const panel = page.locator("aside");
  await spotButton(page, from).click();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  await spotButton(page, from).click();
  await panel.getByTestId("move-open").click();
  await spotButton(page, to).click();
  await expect(spotButton(page, to)).toHaveAttribute("aria-pressed", "true");
  await panel.locator('[data-testid="move-form"] button[type="submit"]').click();
  await expect(panel).toHaveCount(0);
  return { from, to };
}

test("a booking moves to another umbrella from the map", async ({ page }) => {
  const customer = `Move ${Date.now()}`;
  const { from, to } = await bookAndMove(page, DAYS.move, customer);

  await page.goto(`/?date=${DAYS.move}`);
  await expect(spotButton(page, to)).toContainText(customer);
  await expect(spotButton(page, from)).not.toContainText(customer);
  await expect(page.getByTestId("activity").locator("li").first()).toContainText(customer);
});

test("undo puts a moved booking back on its umbrella", async ({ page }) => {
  const customer = `Move undo ${Date.now()}`;
  const { from, to } = await bookAndMove(page, DAYS.undo, customer);

  await page.goto(`/?date=${DAYS.undo}`);
  const latest = page.getByTestId("activity").locator("li").first();
  await expect(latest).toContainText(customer);
  await latest.locator("button").click();
  await expect(spotButton(page, from)).toContainText(customer);
  await expect(spotButton(page, to)).not.toContainText(customer);
});
