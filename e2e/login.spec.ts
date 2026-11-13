import { expect, test, type Page } from "@playwright/test";
import enMessages from "../messages/en.json";
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

test("the language is behind the logged-in user's name", async ({ page }) => {
  await logIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  const language = page.getByLabel(itMessages.common.languageSwitcher.label);
  await expect(language).toBeHidden();

  const user = page.getByRole("button", { name: /^Accesso come / });
  await expect(user).toHaveAttribute("aria-expanded", "false");
  await user.click();
  await expect(language).toBeVisible();

  await language.selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: enMessages.appShell.map })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByLabel(enMessages.common.languageSwitcher.label)).toBeHidden();

  // Leave the shared admin account in Italian for the other tests.
  await page.getByRole("button", { name: /^Signed in as / }).click();
  await page.getByLabel(enMessages.common.languageSwitcher.label).selectOption("it");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
});
