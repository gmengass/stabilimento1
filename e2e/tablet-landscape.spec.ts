import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE } from "./helpers";

// Small tablets (Galaxy Tab A7 Lite, SM-T220) report about 900–1000 CSS px wide in landscape:
// the panel goes beside the map there, and stays below it in portrait. A far-off date of its own.
test.use({ storageState: ADMIN_STATE });

const DAY = "2099-07-01";
const tiles = (page: Page) => page.getByTestId("beach-map").locator("ol button");

async function openPanel(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?date=${DAY}`);
  await tiles(page).first().click();
  const panel = page.locator("aside[data-sheet]");
  await expect(panel).toBeVisible();
  return {
    map: (await page.getByTestId("beach-map").boundingBox())!,
    panel: (await panel.boundingBox())!,
  };
}

for (const [width, height] of [
  [1005, 600],
  [893, 533],
  [800, 480],
]) {
  test(`landscape ${width}×${height}: the panel is beside the map`, async ({ page }) => {
    const { map, panel } = await openPanel(page, width, height);
    expect(panel.x).toBeGreaterThanOrEqual(map.x + map.width);
    expect(panel.y).toBeLessThan(map.y + map.height);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
  });
}

test("portrait 600×1005: the panel is below the map", async ({ page }) => {
  const { map, panel } = await openPanel(page, 600, 1005);
  expect(panel.y).toBeGreaterThanOrEqual(map.y + map.height);
});

test("portrait 800×1280: the panel is below the map", async ({ page }) => {
  const { map, panel } = await openPanel(page, 800, 1280);
  expect(panel.y).toBeGreaterThanOrEqual(map.y + map.height);
});
