import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// Far in the future, so the dates are never "past" and never clash with real seasons.
const SEASON = { name: "E2E 2090", startDate: "2090-06-01", endDate: "2090-09-15" };
const FIRST_DAY = "2090-07-10";
const LAST_DAY = "2090-07-20";
const DAY_AFTER = "2090-07-21";

// Selectors avoid translated text: another test switches the shared admin's language.

test.use({ storageState: ADMIN_STATE });

async function ensureSeason(page: Page): Promise<void> {
  await page.goto("/admin/seasons");
  const existing = page.locator(`input[name="startDate"][value="${SEASON.startDate}"]`);
  if ((await existing.count()) > 0) return;
  const form = page.locator("form").last();
  for (const [field, value] of Object.entries(SEASON)) {
    await form.locator(`input[name="${field}"]`).fill(value);
  }
  await form.locator('button[type="submit"]').click();
  await expect(existing).toHaveCount(1);
}

function spotButton(page: Page, number: string) {
  const label = page.locator("span[aria-hidden]", { hasText: new RegExp(`^${number}$`) });
  return page.getByTestId("beach-map").locator("ol button", { has: label });
}

test("a season pass without a last day runs to the season's end and can be ended later", async ({
  page,
}) => {
  const customer = `Pass ${Date.now()}`;
  await ensureSeason(page);

  await page.goto(`/?date=${FIRST_DAY}`);
  const free = page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") })
    .first();
  const number = (await free.locator("span[aria-hidden]").first().innerText()).trim();
  await free.click();
  const panel = page.locator("aside");
  // Day-booking mode fills "to" with the map date; ticking "season pass" must not keep it.
  await expect(panel.locator('input[name="endDate"]')).toHaveValue(FIRST_DAY);
  await panel.locator('input[type="checkbox"]').check();
  await expect(panel.locator('input[name="startDate"]')).toHaveValue(FIRST_DAY);
  await expect(panel.locator('input[name="endDate"]')).toHaveValue("");
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  await page.goto(`/?date=${SEASON.endDate}`);
  await expect(spotButton(page, number)).toContainText(customer);

  await spotButton(page, number).click();
  const lastDayForm = panel.locator("form", { has: page.locator('input[name="lastDay"]') });
  await lastDayForm.locator('input[name="lastDay"]').fill(LAST_DAY);
  await lastDayForm.locator('button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  await page.goto(`/?date=${DAY_AFTER}`);
  await expect(spotButton(page, number)).not.toContainText(customer);
  await page.goto(`/?date=${LAST_DAY}`);
  await expect(spotButton(page, number)).toContainText(customer);
});

test("quick book sells a season pass that runs to the season's end", async ({ page }) => {
  // Here, not in quick-book.spec: tests in this file share the season and run one after another.
  const customer = `Quick pass ${Date.now()}`;
  const day = "2090-08-10";
  await ensureSeason(page);

  await page.goto(`/?date=${day}`);
  await page.getByTestId("quick-book-open").click();
  const panel = page.locator("aside");
  await panel.locator('input[name="customerName"]').fill(customer);
  await page.getByTestId("quick-book-umbrellas").fill("1");
  await page.getByTestId("quick-book-sunbeds").fill("1");
  await page.getByTestId("quick-book-pass").check();
  await page.getByTestId("quick-book-suggest").click();

  const suggestion = page.getByTestId("quick-book-suggestion");
  const [number = ""] = (await suggestion.innerText()).match(/\b\d{3}\b/g) ?? [];
  const form = panel.locator("form");
  await expect(form.locator('input[type="checkbox"]')).toBeChecked();
  await expect(form.locator('input[name="startDate"]')).toHaveValue(day);
  await expect(form.locator('input[name="endDate"]')).toHaveValue("");
  await form.locator('button[type="submit"]').click();
  await expect(panel).toHaveCount(0);

  await page.goto(`/?date=${SEASON.endDate}`);
  await expect(spotButton(page, number)).toContainText(customer);
});
