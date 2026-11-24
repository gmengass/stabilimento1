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

// Parallel workers' bookings reach this page as live updates: pick a free umbrella (one with no
// name on it, so a retry never reuses its own booking) and wait for the map to show a booking
// before opening it, or the click lands on a stale free tile. Selectors avoid translated text.
const map = (page: Page) => page.getByTestId("beach-map");
const spot = (page: Page, number: string) =>
  map(page).locator("ol button", {
    has: page.locator("span[aria-hidden]", { hasText: new RegExp(`^${number}$`) }),
  });

async function openNewBooking(page: Page, day: string): Promise<string> {
  await page.goto(`/?date=${day}`);
  const free = map(page)
    .locator("ol button", { hasNot: page.locator("span.truncate") })
    .first();
  const number = (await free.locator("span[aria-hidden]").first().innerText()).trim();
  await spot(page, number).click();
  await page.locator('aside input[name="customerName"]').waitFor();
  return number;
}

async function openBooking(page: Page, number: string, customer: string) {
  await expect(spot(page, number).locator("span.truncate")).toHaveText(customer);
  await spot(page, number).click();
  await expect(page.getByTestId("move-open")).toBeVisible();
}

async function bookAndOpen(page: Page, day: string): Promise<string> {
  const number = await openNewBooking(page, day);
  const customer = `Panel ${Date.now()}`;
  await page.locator('aside input[name="customerName"]').fill(customer);
  await page.locator('aside form button[type="submit"]').click();
  await expect(page.locator("aside")).toHaveCount(0);
  await openBooking(page, number, customer);
  return customer;
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
  const title = page.locator("[data-panel-band] h2");
  await expect(title).toHaveText(/^\d+ · Nuova prenotazione$/);
  await expect(title).toHaveCSS("font-size", "15px");
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
  await expect(page.locator("[data-panel-band] h2")).toHaveText(/^\d+ · Panel \d+$/);
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
  await expect(page.locator("[data-panel-band]")).toHaveCSS("background-color", GREEN);
  await expect(page.locator("aside")).toHaveCSS("background-color", "rgb(30, 47, 61)");
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

for (const theme of ["dark", "system"]) {
  test(`${theme} keeps today's panel: no band on a tablet, its own Close`, async ({
    page,
    context,
    baseURL,
  }) => {
    await useTheme(context, baseURL, theme);
    await bookAndOpen(page, theme === "dark" ? "2097-08-05" : "2097-08-06");
    await expect(page.locator("[data-panel-band]")).toHaveCSS("display", "none");
    await expect(page.getByTestId("move-open")).not.toHaveCSS("color", "rgb(232, 238, 242)");
    await page.locator("aside button:visible", { hasText: itMessages.booking.close }).click();
    await expect(page.locator("aside")).toHaveCount(0);
  });
}

test("arturo: the band's Close closes every panel", async ({ page, context, baseURL }) => {
  await useTheme(context, baseURL, "arturo");
  const number = await openNewBooking(page, "2097-08-07");
  await page.locator("[data-sheet-close]").click();
  await expect(page.locator("aside")).toHaveCount(0);
  await spot(page, number).click();
  const customer = `Panel ${Date.now()}`;
  await page.locator('aside input[name="customerName"]').fill(customer);
  await page.locator('aside form button[type="submit"]').click();
  await expect(page.locator("aside")).toHaveCount(0);

  await openBooking(page, number, customer);
  await page.locator("[data-sheet-close]").click();
  await expect(page.locator("aside")).toHaveCount(0);

  await spot(page, number).click();
  await page.getByTestId("move-open").click();
  await page.getByTestId("move-form").waitFor();
  await page.locator("[data-sheet-close]").click();
  await expect(page.locator("aside")).toHaveCount(0);

  await page.getByTestId("quick-book-open").click();
  await page.getByTestId("quick-book-form").waitFor();
  await page.locator("[data-sheet-close]").click();
  await expect(page.locator("aside")).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("sera: the band's Close closes the sheet", async ({ page, context, baseURL }) => {
    await useTheme(context, baseURL, "sera");
    await openNewBooking(page, "2097-08-08");
    await expect(page.locator("[data-panel-band]")).toHaveCSS("background-color", GREEN);
    await page.locator("[data-sheet-close]").click();
    await expect(page.locator("aside")).toHaveCount(0);
  });
});
