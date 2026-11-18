import { expect, test, type Browser, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// Two devices on the same map: both reuse the admin's saved session (sign-in is rate-limited).
// A year no other spec books in (they use 2090–2094), one day per test.
const DAYS = { book: "2095-07-01", cancel: "2095-07-02", offline: "2095-07-03" };
/** Changes must reach the other device within seconds, without a reload. */
const LIVE = { timeout: 5_000 };

// Selectors avoid translated text: another test switches the shared admin's language. The
// cancel buttons have no test id; they are the panel's only red-bordered and red buttons.

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

async function book(page: Page, number: string, customer: string) {
  const panel = page.locator("aside");
  await spotButton(page, number).click();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);
}

async function cancel(page: Page, number: string) {
  const panel = page.locator("aside");
  await spotButton(page, number).click();
  await panel.locator("button.border-red-700").click();
  await panel.locator("button.bg-red-700").click();
  await expect(panel).toHaveCount(0);
}

/** Two signed-in devices on the same day's map, connected to the live stream. */
async function twoDevices(browser: Browser, date: string) {
  const pages = await Promise.all(
    [0, 1].map(async () => {
      const context = await browser.newContext({ storageState: ADMIN_STATE });
      const page = await context.newPage();
      await page.goto(`/?date=${date}`);
      await expect(page.getByTestId("beach-map")).toBeVisible();
      return page;
    }),
  );
  return { a: pages[0], b: pages[1] };
}

/** Marks the page so a full reload (which would clear the mark) can be detected. */
async function markNoReload(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __liveMark: boolean }).__liveMark = true;
  });
}

async function wasNotReloaded(page: Page) {
  return page.evaluate(() => (window as unknown as { __liveMark?: boolean }).__liveMark === true);
}

test("a booking made on one device shows on another without a reload", async ({ browser }) => {
  const customer = `Live ${Date.now()}`;
  const { a, b } = await twoDevices(browser, DAYS.book);
  const number = await firstFree(a);
  await markNoReload(b);

  await book(a, number, customer);

  await expect(spotButton(b, number)).toContainText(customer, LIVE);
  expect(await wasNotReloaded(b)).toBe(true);
  await a.context().close();
  await b.context().close();
});

test("a booking open on one device updates when another cancels it", async ({ browser }) => {
  const customer = `Live cancel ${Date.now()}`;
  const { a, b } = await twoDevices(browser, DAYS.cancel);
  const number = await firstFree(a);
  await book(a, number, customer);

  await expect(spotButton(b, number)).toContainText(customer, LIVE);
  await spotButton(b, number).click();
  await expect(b.locator("aside")).toContainText(customer);
  await markNoReload(b);

  await cancel(a, number);

  await expect(spotButton(b, number)).not.toContainText(customer, LIVE);
  await expect(b.locator("aside", { hasText: customer })).toHaveCount(0, LIVE);
  expect(await wasNotReloaded(b)).toBe(true);
  await a.context().close();
  await b.context().close();
});

test("a device that was offline shows it is reconnecting, then catches up", async ({ browser }) => {
  const customer = `Live offline ${Date.now()}`;
  const { a, b } = await twoDevices(browser, DAYS.offline);
  const number = await firstFree(a);
  const status = b.getByTestId("live-status");
  await expect(status).toHaveCount(0);
  await markNoReload(b);

  await b.context().setOffline(true);
  await expect(status).toBeVisible({ timeout: 10_000 });

  await book(a, number, customer);
  await expect(spotButton(b, number)).not.toContainText(customer);

  await b.context().setOffline(false);
  await expect(spotButton(b, number)).toContainText(customer, { timeout: 15_000 });
  await expect(status).toHaveCount(0, { timeout: 15_000 });
  expect(await wasNotReloaded(b)).toBe(true);
  await a.context().close();
  await b.context().close();
});
