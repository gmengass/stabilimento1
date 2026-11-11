import { expect, test, type Page } from "@playwright/test";
import itMessages from "../messages/it.json";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";

async function logIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: itMessages.login.submit }).click();
}

test.describe("logged out", () => {
  for (const path of ["/", "/admin/staff"]) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator('input[name="username"]')).toBeVisible();
    });
  }

  test("/health is 200 without a session", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
  });

  test("the login fields have labels", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(itMessages.login.username)).toHaveAttribute("name", "username");
    await expect(page.getByLabel(itMessages.login.password)).toHaveAttribute("name", "password");
  });
});

test("a wrong password shows an alert and stays on /login", async ({ page }) => {
  await logIn(page, ADMIN_USERNAME, `${ADMIN_PASSWORD}-wrong`);
  await expect(page.getByText(itMessages.login.errors.invalid)).toHaveAttribute("role", "alert");
  await expect(page).toHaveURL(/\/login$/);
});

test("the seeded admin logs in, logs out, and back does not reopen the app", async ({ page }) => {
  await logIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  const logout = page.getByRole("button", { name: itMessages.appShell.logout });
  await expect(logout).toBeVisible();

  await logout.click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: itMessages.appShell.logout })).toHaveCount(0);
});
