import type { Page } from "@playwright/test";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";

/**
 * Sign-in is limited to 5 a minute per client address (src/lib/auth/auth.ts) and a spec that
 * signs in several times can use them all. Caddy overwrites `x-real-ip` in production, but the e2e
 * server has no proxy, so a spec can claim its own bucket with `test.use(ownSignInBucket(...))`.
 * Addresses must be valid and different: anything else falls back to the shared bucket.
 */
export const SIGN_IN_ADDRESS = { login: "10.77.0.2", tablet: "10.77.0.1" } as const;

export function ownSignInBucket(address: string) {
  return { extraHTTPHeaders: { "x-real-ip": address } };
}

/** Saved session of the admin, written by admin.setup.ts. */
export const ADMIN_STATE = "playwright/.auth/admin.json";

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

const SIGN_IN_TRIES = 5;
const SIGN_IN_WAIT_MS = 15_000;

/**
 * Signs in a given user. Sign-in is limited to 5 per minute per address and the other specs use
 * most of them, so a refused attempt waits and tries again.
 */
export async function logInAs(page: Page, username: string, password: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/login");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL("/", { timeout: 5_000 });
      return;
    } catch (error) {
      if (attempt >= SIGN_IN_TRIES) throw error;
      await page.waitForTimeout(SIGN_IN_WAIT_MS);
    }
  }
}
