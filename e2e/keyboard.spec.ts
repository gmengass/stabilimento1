import { expect, test, type Locator, type Page } from "@playwright/test";

import { ADMIN_PASSWORD, ADMIN_USERNAME, ownSignInBucket, SIGN_IN_ADDRESS } from "./helpers";

// The accessibility pass's keyboard criterion (docs/plans/accessibility.md): sign in, change the
// date, book, cancel and undo with the keyboard alone. Tab moves focus; nothing is clicked.
// A year no other spec books in (they use 2090–2095). Selectors avoid translated text.
// en-US fixes the date field's typing order: month, day, year.
const DAY = "2096-07-10";
const MAX_TABS = 80;

test.use({ ...ownSignInBucket(SIGN_IN_ADDRESS.keyboard), locale: "en-US" });

/** Presses Tab until `target` has focus, so the test fails if the keyboard can't reach it. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let tabs = 0; tabs < MAX_TABS; tabs += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${target}`);
}

function spotButton(page: Page, number: string) {
  const label = page.locator("span[aria-hidden]", { hasText: new RegExp(`^${number}$`) });
  return page.getByTestId("beach-map").locator("ol button", { has: label });
}

test("staff sign in, change the date, book, cancel and undo with the keyboard alone", async ({
  page,
}) => {
  const customer = `Keyboard ${Date.now()}`;
  const panel = page.locator("aside");

  await page.goto("/login");
  await tabTo(page, page.locator('input[name="username"]'));
  await page.keyboard.type(ADMIN_USERNAME);
  await tabTo(page, page.locator('input[name="password"]'));
  await page.keyboard.type(ADMIN_PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL("/");

  await tabTo(page, page.getByTestId("date-nav").locator('input[type="date"]'));
  await page.keyboard.type("07102096");
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`date=${DAY}`));

  // Free tiles have no customer name; a retry finds the first run's booking on the first tile.
  const free = page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") })
    .first();
  const number = (await free.locator("span[aria-hidden]").first().innerText()).trim();
  const tile = spotButton(page, number);
  await tabTo(page, tile);
  await page.keyboard.press("Enter");
  await tabTo(page, panel.locator('input[name="customerName"]'));
  await page.keyboard.type(customer);
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);
  await expect(tile).toContainText(customer);

  // Opening a booking from the keyboard puts focus in the panel beside the map.
  await tabTo(page, tile);
  await page.keyboard.press("Enter");
  await expect(panel).toBeFocused();
  await tabTo(page, panel.locator("button.border-red-700"));
  await page.keyboard.press("Enter");
  await tabTo(page, panel.locator("button.bg-red-700"));
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);
  await expect(tile).not.toContainText(customer);
  await expect(tile).toBeFocused();

  const undo = page.getByTestId("activity").locator("li").first().getByTestId("undo");
  await tabTo(page, undo);
  await page.keyboard.press("Enter");
  await expect(tile).toContainText(customer);
});
