import { expect, test, type Page } from "@playwright/test";

import itMessages from "../messages/it.json";
import { ADMIN_STATE } from "./helpers";

// A fresh context per test, so the theme cookie never leaks into other specs.
test.use({ storageState: ADMIN_STATE, colorScheme: "light" });

const userButton = (page: Page) =>
  page.getByRole("button", { name: itMessages.appShell.signedInAs.replace("{name}", "").trim() });
const themeSelect = (page: Page) => page.getByLabel(itMessages.common.themeSwitcher.label);
const backgroundOf = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const WHITE = "rgb(255, 255, 255)";
const NEAR_BLACK = "rgb(10, 10, 10)";

test("the theme is in the user menu, applies at once and survives reload", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "system");
  expect(await backgroundOf(page)).toBe(WHITE);

  await expect(themeSelect(page)).toBeHidden();
  await userButton(page).click();
  await themeSelect(page).selectOption("dark");
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await backgroundOf(page)).toBe(NEAR_BLACK);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await backgroundOf(page)).toBe(NEAR_BLACK);

  await userButton(page).click();
  await themeSelect(page).selectOption("light");
  await expect(html).toHaveAttribute("data-theme", "light");
  expect(await backgroundOf(page)).toBe(WHITE);
});

test("automatic follows the device's dark setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  expect(await backgroundOf(page)).toBe(NEAR_BLACK);
});

test("an invalid theme cookie falls back to automatic", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "theme", value: "blue", url: baseURL! }]);
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
});
