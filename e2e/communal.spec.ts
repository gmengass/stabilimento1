import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";

import { ADMIN_STATE, SIGN_IN_ADDRESS, logInAs, ownSignInBucket } from "./helpers";

// Shared tablet accounts (ADR 0025). A year no other spec books in (they use 2090 to 2095).
// Selectors avoid translated text: another test switches the shared admin's language.

const DATE = "2096-07-01";
const PASSWORD = "e2e-tablet-pass-1";
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };
const MIN_TAP = 44;

const stamp = Date.now().toString(36);
const accounts = {
  tablet: { username: `tablet_${stamp}`, name: `Tablet ${stamp}` },
  anna: { username: `anna_${stamp}`, name: `Anna ${stamp}` },
  bruno: { username: `bruno_${stamp}`, name: `Bruno ${stamp}` },
};

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

/** Fills in and submits a booking for the first free umbrella; the panel is `aside`. */
async function submitBooking(page: Page, customer: string): Promise<void> {
  await page.goto(`/?date=${DATE}`);
  await spotButton(page, await firstFree(page)).click();
  const panel = page.locator("aside");
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').click();
}

async function createAccount(
  page: Page,
  account: { username: string; name: string },
  communal: boolean,
): Promise<void> {
  await page.goto("/admin/staff");
  const form = page.locator('form:has(input[name="username"]):has(input[name="name"])').last();
  await form.locator('input[name="username"]').fill(account.username);
  await form.locator('input[name="name"]').fill(account.name);
  await form.locator('input[name="password"]').fill(PASSWORD);
  if (communal) await form.locator('input[name="communal"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("tr", { hasText: account.username })).toBeVisible();
}

/** Makes the tablet's chosen person look idle for longer than the 2 minutes the server allows. */
async function makeSelectionStale(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("update acting_staff set last_used_at = now() - interval '3 minutes'");
  } finally {
    await client.end();
  }
}

async function signedInTablet(browser: Browser): Promise<Page> {
  const admin = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await admin.newPage();
  await createAccount(adminPage, accounts.anna, false);
  await createAccount(adminPage, accounts.bruno, false);
  await createAccount(adminPage, accounts.tablet, true);
  await admin.close();

  const context = await browser.newContext({
    viewport: TABLET,
    ...ownSignInBucket(SIGN_IN_ADDRESS.tablet),
  });
  const page = await context.newPage();
  await logInAs(page, accounts.tablet.username, PASSWORD);
  return page;
}

test.describe.serial("shared tablet account", () => {
  test.setTimeout(120_000);
  let tablet: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    tablet = await signedInTablet(browser);
  });

  test.afterAll(async () => {
    await tablet.context().close();
  });

  test("asks who is doing it, records that person, then stops asking", async () => {
    const dialog = tablet.getByTestId("acting-dialog");
    const activity = tablet.getByTestId("activity").locator("li");
    const entry = (customer: string) => activity.filter({ hasText: `${customer} ${stamp}` });

    await submitBooking(tablet, `Tablet first ${stamp}`);
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("acting-choice").filter({ hasText: accounts.anna.name }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tablet.locator("aside")).toHaveCount(0);

    await expect(entry("Tablet first")).toContainText(accounts.anna.name);
    await expect(entry("Tablet first")).not.toContainText(accounts.tablet.name);
    await expect(tablet.getByTestId("acting-as")).toContainText(accounts.anna.name);

    await submitBooking(tablet, `Tablet second ${stamp}`);
    await expect(tablet.locator("aside")).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    await expect(entry("Tablet second")).toContainText(accounts.anna.name);
  });

  test("the person acting can undo their own action, and nobody can once it is cleared", async () => {
    await tablet.goto(`/?date=${DATE}`);
    const mine = tablet
      .getByTestId("activity")
      .locator("li")
      .filter({ hasText: `Tablet second ${stamp}` });
    await expect(mine.getByTestId("undo")).toBeVisible();

    await tablet.getByTestId("acting-not-me").click();
    await expect(tablet.getByTestId("acting-as")).toHaveCount(0);
    await expect(tablet.getByTestId("undo")).toHaveCount(0);
  });

  test("asks again after the selection has been idle for more than 2 minutes", async () => {
    test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to age the selection");
    const dialog = tablet.getByTestId("acting-dialog");

    await submitBooking(tablet, `Tablet third ${stamp}`);
    await dialog.getByTestId("acting-choice").filter({ hasText: accounts.anna.name }).click();
    await expect(tablet.locator("aside")).toHaveCount(0);

    await makeSelectionStale();
    await submitBooking(tablet, `Tablet fourth ${stamp}`);
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("acting-choice").filter({ hasText: accounts.bruno.name }).click();
    await expect(tablet.locator("aside")).toHaveCount(0);
    const fourth = tablet
      .getByTestId("activity")
      .locator("li")
      .filter({ hasText: `Tablet fourth ${stamp}` });
    await expect(fourth).toContainText(accounts.bruno.name);
  });

  test("cancelling the pop-up books nothing", async () => {
    await tablet
      .getByTestId("acting-not-me")
      .click()
      .catch(() => undefined);
    await submitBooking(tablet, `Tablet cancelled ${stamp}`);
    const dialog = tablet.getByTestId("acting-dialog");
    await expect(dialog).toBeVisible();
    await tablet.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(tablet.getByTestId("activity")).not.toContainText(`Tablet cancelled ${stamp}`);
  });

  test("on a phone the pop-up's name buttons are easy to tap and fit the screen", async () => {
    await tablet.setViewportSize(PHONE);
    await submitBooking(tablet, `Tablet phone ${stamp}`);
    const dialog = tablet.getByTestId("acting-dialog");
    await expect(dialog).toBeVisible();

    const choices = dialog.getByTestId("acting-choice");
    expect(await choices.count()).toBeGreaterThanOrEqual(2);
    for (const choice of await choices.all()) {
      const box = await choice.boundingBox();
      if (!box) throw new Error("no bounding box");
      expect(box.height, "name button height").toBeGreaterThanOrEqual(MIN_TAP);
      expect(box.x, "left edge").toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, "right edge").toBeLessThanOrEqual(PHONE.width);
    }
    await dialog.getByTestId("acting-choice").filter({ hasText: accounts.anna.name }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("cannot open the admin pages", async () => {
    await tablet.setViewportSize(TABLET);
    for (const path of ["/admin/beach", "/admin/seasons", "/admin/staff"]) {
      await tablet.goto(path);
      await expect(tablet, path).toHaveURL(/\/(\?.*)?$/);
      await expect(tablet.getByTestId("beach-map"), path).toBeVisible();
    }
  });

  test("disabling the person acting asks again, and their name is no longer offered", async ({
    browser,
  }) => {
    const dialog = tablet.getByTestId("acting-dialog");
    // The phone test chose Anna moments ago: clear it, so this booking asks.
    await tablet.goto(`/?date=${DATE}`);
    await tablet.getByTestId("acting-not-me").click();
    await expect(tablet.getByTestId("acting-as")).toHaveCount(0);
    await submitBooking(tablet, `Tablet before disable ${stamp}`);
    await dialog.getByTestId("acting-choice").filter({ hasText: accounts.anna.name }).click();
    await expect(tablet.locator("aside")).toHaveCount(0);

    const admin = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/staff");
    const row = adminPage.locator("tr", { hasText: accounts.anna.username });
    await row.locator('button[type="button"]').first().click();
    await expect(row.locator('[role="status"]')).toBeVisible();
    await admin.close();

    await submitBooking(tablet, `Tablet after disable ${stamp}`);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByTestId("acting-choice").filter({ hasText: accounts.anna.name }),
    ).toHaveCount(0);
    await dialog.getByTestId("acting-choice").filter({ hasText: accounts.bruno.name }).click();
    await expect(tablet.locator("aside")).toHaveCount(0);
    const after = tablet
      .getByTestId("activity")
      .locator("li")
      .filter({ hasText: `Tablet after disable ${stamp}` });
    await expect(after).toContainText(accounts.bruno.name);
  });
});
