import type { Page } from "@playwright/test";

export const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";

/** Saved session of the admin, written by admin.setup.ts. */
export const ADMIN_STATE = "test-results/.auth/admin.json";

export async function logIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(ADMIN_USERNAME);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/");
}

/** The first-run setup is the only form with both the venue name and the layout fields. */
export async function ensureBeach(page: Page): Promise<void> {
  await page.goto("/admin/beach");
  const setup = page.locator('form:has(input[name="venueName"]):has(input[name="lines"])');
  if ((await setup.count()) === 0) return;
  await setup.locator('input[name="venueName"]').fill("Lido E2E");
  await setup.locator('input[name="lines"]').fill("2");
  await setup.locator('input[name="umbrellasPerLine"]').fill("6");
  await setup.locator('button[type="submit"]').click();
  await page.waitForURL("/", { timeout: 15_000 });
}
