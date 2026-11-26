import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// A year no other spec books in (they use 2090–2093), one day per test.
const DAYS = { counts: "2094-07-01", search: "2094-07-02" };

// Selectors avoid translated text: another test switches the shared admin's language.

test.use({ storageState: ADMIN_STATE });

function freeSpots(page: Page) {
  return page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") });
}

/** "… 11 / 12" → [11, 12], for the umbrellas then the sunbeds. */
async function counts(page: Page): Promise<number[][]> {
  const spans = page.getByTestId("day-counts").locator("[data-count]");
  const texts = await spans.allInnerTexts();
  return texts.map((text) => (text.match(/(\d+) \/ (\d+)/) ?? []).slice(1).map(Number));
}

async function bookFirstFree(page: Page, date: string, customer: string) {
  await page.goto(`/?date=${date}`);
  const panel = page.locator("aside");
  await freeSpots(page).first().click();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').click();
  await expect(panel).toHaveCount(0);
}

test("booking an umbrella lowers the day's free umbrellas and sunbeds", async ({ page }) => {
  await page.goto(`/?date=${DAYS.counts}`);
  const [[umbrellas, totalUmbrellas], [sunbeds, totalSunbeds]] = await counts(page);
  await bookFirstFree(page, DAYS.counts, `Counts ${Date.now()}`);
  await expect
    .poll(() => counts(page))
    .not.toEqual([
      [umbrellas, totalUmbrellas],
      [sunbeds, totalSunbeds],
    ]);
  const [[nowUmbrellas, nowTotal], [nowSunbeds, nowSunbedTotal]] = await counts(page);
  expect([nowUmbrellas, nowTotal, nowSunbedTotal]).toEqual([
    umbrellas - 1,
    totalUmbrellas,
    totalSunbeds,
  ]);
  expect(nowSunbeds).toBeLessThan(sunbeds);
});

test("search by name opens the booking's panel on its day", async ({ page }) => {
  const customer = `Cerca${Date.now()}`;
  await bookFirstFree(page, DAYS.search, customer);
  await page.goto("/");
  await page.getByRole("search").locator('input[name="q"]').fill(customer.toLowerCase());
  await page.getByRole("search").locator('button[type="submit"]').click();
  await page.waitForURL(/\/search\?/);
  const result = page.getByTestId("search-result");
  await expect(result).toHaveCount(1);
  await result.click();
  await page.waitForURL(new RegExp(`date=${DAYS.search}.*booking=\\d+`));
  await expect(page.locator("aside")).toContainText(customer);
});

test("a too-short query shows a hint, not results", async ({ page }) => {
  await page.goto("/search?q=a");
  await expect(page.getByTestId("search-result")).toHaveCount(0);
  await expect(page.getByRole("search").locator('input[name="q"]')).toHaveValue("a");
});
