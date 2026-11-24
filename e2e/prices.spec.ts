import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// The same far-off season as season-pass.spec.ts, so neither spec blocks the other from adding it;
// booked on days that spec leaves alone.
const SEASON = { name: "E2E 2090", startDate: "2090-06-01", endDate: "2090-09-15" };
const FROM = "2090-08-20";
const TO = "2090-08-21";

// Selectors avoid translated text: another test switches the shared admin's language.

test.use({ storageState: ADMIN_STATE });

async function ensureSeason(page: Page): Promise<void> {
  await page.goto("/admin/seasons");
  const existing = page.locator(`input[name="startDate"][value="${SEASON.startDate}"]`);
  if ((await existing.count()) === 0) {
    const form = page.locator("form").last();
    for (const [field, value] of Object.entries(SEASON)) {
      await form.locator(`input[name="${field}"]`).fill(value);
    }
    await form.locator('button[type="submit"]').click();
    // The other spec may have added it at the same moment: reload and look again.
    await page.waitForTimeout(500);
    await page.reload();
  }
  await expect(existing).toHaveCount(1);
}

async function enterPrices(page: Page): Promise<void> {
  await ensureSeason(page);
  const card = page.locator("form", {
    has: page.locator(`input[name="startDate"][value="${SEASON.startDate}"]`),
  });
  await card.locator('a[href$="/prices"]').click();
  await expect(page).toHaveURL(/\/admin\/seasons\/\d+\/prices$/);
  const rows: [string, string, string][] = [
    ["1", "10", "30"],
    ["2", "20", "57,50"],
    ["season", "850", "2550"],
  ];
  for (const [key, single, bundle] of rows) {
    await page.locator(`input[name="single-${key}"]`).fill(single);
    await page.locator(`input[name="bundle-${key}"]`).fill(bundle);
  }
  const editor = page.locator("form", { has: page.locator('input[name="single-1"]') });
  await editor.locator('button[type="submit"]').click();
  await expect(editor.locator('p[role="status"]')).toBeVisible();
}

test("staff open the price list from the top bar and close it", async ({ page }) => {
  await enterPrices(page);
  await page.goto("/");
  await page.locator('nav a[href="/prices"]').click();
  await expect(page).toHaveURL(/\/prices$/);
  // The map's layout may stay mounted but hidden (Next keeps it for going back): none visible.
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.locator("table")).toContainText(/57[.,]50/);
  await page.locator('main a[href="/"]:visible').click();
  await expect(page.getByTestId("beach-map")).toBeVisible();
});

test("a booking shows its suggested price and can be marked paid, then undone", async ({
  page,
}) => {
  await enterPrices(page);
  const customer = `Paid ${Date.now()}`;
  await page.goto(`/?date=${FROM}`);
  const free = page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") })
    .last();
  const number = (await free.locator("span[aria-hidden]").first().innerText()).trim();
  await free.click();
  const panel = page.locator("aside");
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('input[name="endDate"]').fill(TO);
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  const label = page.locator("span[aria-hidden]", { hasText: new RegExp(`^${number}$`) });
  await page.getByTestId("beach-map").locator("ol button", { has: label }).click();
  // An umbrella and its 2 sunbeds for 2 days: one bundle at the 2-day price.
  await expect(panel.getByTestId("suggested-price")).toHaveText(/57[.,]50/);
  await expect(panel.getByTestId("price-discount")).toBeVisible();

  await panel.getByTestId("paid-tick").check();
  await expect(panel.getByTestId("paid-tick")).toBeChecked();
  // The paid entry names the suggested price; the booking's own entry doesn't.
  const entry = page
    .getByTestId("activity")
    .locator("li", { hasText: customer })
    .filter({ hasText: /57[.,]50/ });
  await expect(entry).toBeVisible();

  await entry.locator("button").click();
  await expect(panel.getByTestId("paid-tick")).not.toBeChecked();
});
