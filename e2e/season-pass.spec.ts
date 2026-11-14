import { expect, test, type Page } from "@playwright/test";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";

// Far in the future, so the dates are never "past" and never clash with real seasons.
const SEASON = { name: "E2E 2090", startDate: "2090-06-01", endDate: "2090-09-15" };
const FIRST_DAY = "2090-07-10";
const LAST_DAY = "2090-07-20";
const DAY_AFTER = "2090-07-21";

// Selectors avoid translated text: another test switches the shared admin's language.

async function logIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(ADMIN_USERNAME);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/");
}

/** The first-run setup is the only form with both the venue name and the layout fields. */
async function ensureBeach(page: Page): Promise<void> {
  await page.goto("/admin/beach");
  const setup = page.locator('form:has(input[name="venueName"]):has(input[name="lines"])');
  if ((await setup.count()) === 0) return;
  await setup.locator('input[name="venueName"]').fill("Lido E2E");
  await setup.locator('input[name="lines"]').fill("2");
  await setup.locator('input[name="umbrellasPerLine"]').fill("6");
  await setup.locator('button[type="submit"]').click();
  await page.waitForURL("/", { timeout: 15_000 });
}

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
  return page.locator("ol button", { has: label });
}

test("a season pass without a last day runs to the season's end and can be ended later", async ({
  page,
}) => {
  const customer = `Pass ${Date.now()}`;
  await logIn(page);
  await ensureBeach(page);
  await ensureSeason(page);

  await page.goto(`/?date=${FIRST_DAY}`);
  const free = page.locator("ol button", { hasNot: page.locator("span.truncate") }).first();
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
