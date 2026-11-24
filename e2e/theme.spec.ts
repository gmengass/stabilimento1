import { expect, test, type BrowserContext, type Page } from "@playwright/test";

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

const SAND = "rgb(251, 246, 236)";
const NIGHT = "rgb(22, 35, 47)";
const GREEN = "rgb(31, 61, 43)";
const ORANGE = "rgb(232, 134, 42)";

const bannerStyle = (page: Page) =>
  page
    .locator("nav")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        stripe: s.borderBottomColor,
        stripeWidth: s.borderBottomWidth,
      };
    });
const BANNER = { background: GREEN, stripe: ORANGE, stripeWidth: "5px" };

const tileSize = async (page: Page) => {
  const box = await page.locator("[data-spot-id]").first().boundingBox();
  expect(box).not.toBeNull();
  return { width: Math.round(box!.width), height: Math.round(box!.height) };
};

const useTheme = (context: BrowserContext, baseURL: string | undefined, value: string) =>
  context.addCookies([{ name: "theme", value, url: baseURL! }]);

test("arturo: sand page, green banner with orange stripe, survives reload", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await userButton(page).click();
  await themeSelect(page).selectOption("arturo");
  await expect(html).toHaveAttribute("data-theme", "arturo");
  expect(await backgroundOf(page)).toBe(SAND);
  expect(await bannerStyle(page)).toEqual(BANNER);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "arturo");
  expect(await backgroundOf(page)).toBe(SAND);
  expect(await bannerStyle(page)).toEqual(BANNER);
});

test("sera: night page, same banner, dark color scheme", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await userButton(page).click();
  await themeSelect(page).selectOption("sera");
  await expect(html).toHaveAttribute("data-theme", "sera");
  expect(await backgroundOf(page)).toBe(NIGHT);
  expect(await bannerStyle(page)).toEqual(BANNER);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    "dark",
  );

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "sera");
  expect(await backgroundOf(page)).toBe(NIGHT);
});

test("arturo uses sun tiles of at least 64 × 72 px", async ({ page, context, baseURL }) => {
  await useTheme(context, baseURL, "arturo");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "arturo");
  const { width, height } = await tileSize(page);
  expect(width).toBeGreaterThanOrEqual(64);
  expect(height).toBeGreaterThanOrEqual(72);
});

test("light keeps today's 56px tiles", async ({ page, context, baseURL }) => {
  await useTheme(context, baseURL, "light");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect((await tileSize(page)).height).toBe(56);
});

test.describe("at 1280 × 800 in arturo", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a line of 18 umbrellas fits without sideways scrolling", async ({
    page,
    context,
    baseURL,
  }) => {
    await useTheme(context, baseURL, "arturo");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "arturo");
    const map = page.getByTestId("beach-map");
    const line = map.locator("ol").first();
    // The e2e beach has 6 umbrellas a line, which stretch: check the tile's minimum width instead.
    const { width, gap } = await line.evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.width = "var(--tile-min)";
      el.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return { width, gap: parseFloat(getComputedStyle(el).columnGap) || 0 };
    });
    expect(width).toBe(64);
    const { clientWidth, scrollWidth } = await map.evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    expect(18 * width + 17 * gap).toBeLessThanOrEqual(clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
