import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import itMessages from "../messages/it.json";
import { ADMIN_STATE } from "./helpers";

// Booking panel colours in Arturo and Sera (docs/plans/theme-panel.md). Far-off dates of its own,
// so no other spec books on them.
test.use({ storageState: ADMIN_STATE, viewport: { width: 1280, height: 900 } });

const GREEN = "rgb(31, 61, 43)";
const ORANGE = "rgb(232, 134, 42)";
const DARK_BROWN = "rgb(42, 20, 2)";

const useTheme = (context: BrowserContext, baseURL: string | undefined, value: string) =>
  context.addCookies([{ name: "theme", value, url: baseURL! }]);

const style = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        color: s.color,
        border: s.borderTopColor,
        stripe: s.borderBottomColor,
        stripeWidth: s.borderBottomWidth,
        display: s.display,
      };
    });

async function openNewBooking(page: Page, day: string) {
  await page.goto(`/?date=${day}`);
  await page.getByTestId("beach-map").locator("ol button").first().click();
  await page.locator("aside").waitFor();
}

async function bookAndOpen(page: Page, day: string) {
  await openNewBooking(page, day);
  await page.locator('aside input[name="customerName"]').fill(`Panel ${Date.now()}`);
  await page.locator('aside form button[type="submit"]').click();
  await expect(page.locator("aside")).toHaveCount(0);
  await page.getByTestId("beach-map").locator("ol button").first().click();
  await page.locator("aside").waitFor();
}

test("arturo: green band, white panel, orange main button, green outlined buttons", async ({
  page,
  context,
  baseURL,
}) => {
  await useTheme(context, baseURL, "arturo");
  await openNewBooking(page, "2097-08-01");

  const band = await style(page, "[data-panel-band]");
  expect(band).toMatchObject({
    background: GREEN,
    stripe: ORANGE,
    stripeWidth: "4px",
    display: "flex",
  });
  await expect(page.locator("[data-panel-band] h2")).toHaveText(/\S/);
  expect((await style(page, "aside")).background).toBe("rgb(255, 255, 255)");
  expect(await style(page, 'aside form button[type="submit"]')).toMatchObject({
    background: ORANGE,
    color: DARK_BROWN,
  });
  const remove = page.locator("aside button", { hasText: itMessages.booking.remove });
  await expect(remove).toHaveCSS("border-top-color", GREEN);
  await expect(remove).toHaveCSS("color", GREEN);
  await expect(page.getByTestId("quick-book-open")).toHaveCSS("background-color", ORANGE);
});

test("arturo: the cancel confirmation is dark red", async ({ page, context, baseURL }) => {
  await useTheme(context, baseURL, "arturo");
  await bookAndOpen(page, "2097-08-02");
  const trigger = page.locator("aside button", { hasText: itMessages.booking.cancel });
  await expect(trigger).toHaveCSS("color", "rgb(139, 26, 26)");
  await trigger.click();
  const yes = page.locator("aside button", { hasText: itMessages.booking.cancelYes });
  await expect(yes).toHaveCSS("background-color", "rgb(139, 26, 26)");
  await expect(yes).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("sera: night panel, same band, orange main button, red cancel", async ({
  page,
  context,
  baseURL,
}) => {
  await useTheme(context, baseURL, "sera");
  await bookAndOpen(page, "2097-08-03");
  expect((await style(page, "[data-panel-band]")).background).toBe(GREEN);
  expect((await style(page, "aside")).background).toBe("rgb(30, 47, 61)");
  await expect(page.getByTestId("move-open")).toHaveCSS("color", "rgb(232, 238, 242)");
  await page.locator("aside button", { hasText: itMessages.booking.cancel }).click();
  const yes = page.locator("aside button", { hasText: itMessages.booking.cancelYes });
  await expect(yes).toHaveCSS("background-color", "rgb(180, 35, 24)");
});

test("light keeps today's panel: no band on a tablet, blue main button", async ({
  page,
  context,
  baseURL,
}) => {
  await useTheme(context, baseURL, "light");
  await openNewBooking(page, "2097-08-04");
  expect((await style(page, "[data-panel-band]")).display).toBe("none");
  const submit = await style(page, 'aside form button[type="submit"]');
  expect(submit.background).not.toBe(ORANGE);
  expect(submit.color).toBe("rgb(255, 255, 255)");
});
