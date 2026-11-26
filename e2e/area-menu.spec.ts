import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STATE, ensureBeach } from "./helpers";

// Runs after the other specs (the "spaces" project): a second beach space changes the banner.
// Selectors avoid translated text: another test switches the shared admin's language.

test.use({ storageState: ADMIN_STATE });

/** The add-space form: a space name and layout fields, but no venue name (that's first-run setup). */
const ADD_FORM =
  'form:has(input[name="areaName"]):has(input[name="umbrellasPerLine"]):not(:has(input[name="venueName"]))';

async function addArea(page: Page, name: string): Promise<string> {
  await page.goto("/admin/beach");
  const form = page.locator(ADD_FORM);
  await form.locator('input[name="areaName"]').fill(name);
  await form.locator('input[name="lines"]').fill("1");
  await form.locator('input[name="umbrellasPerLine"]').fill("4");
  await form.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/beach\?area=\d+/);
  return new URL(page.url()).searchParams.get("area")!;
}

async function removeArea(page: Page, id: string): Promise<void> {
  await page.goto(`/admin/beach?area=${id}`);
  const form = page.locator('form:has(input[name="areaName"]):not(:has(input[name="lines"]))');
  await form.locator('button[type="button"]').click();
  await form.locator("button.bg-red-700").click();
  await page.waitForURL(/\/admin\/beach$/);
}

test("the banner names the space; its menu switches space and keeps the day", async ({ page }) => {
  await ensureBeach(page);
  const name = `Pineta ${Date.now() % 100_000}`;
  const id = await addArea(page, name);
  try {
    const day = "2095-03-03";
    await page.goto(`/?date=${day}`);
    const mapLink = page.getByTestId("area-menu-map");
    const toggle = page.getByTestId("area-menu-toggle");
    const list = page.getByTestId("area-menu-list");
    const sea = page.getByTestId("sea-band");
    const first = await mapLink.locator("span.font-bold").textContent();
    expect(first).not.toBe(name);
    await expect(sea).toContainText(first!);
    await expect(list).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(list.locator('a[aria-current="page"]')).toHaveText(first!);
    await list.getByRole("link", { name }).click();
    await page.waitForURL(`/?area=${id}&date=${day}`);
    await expect(list).toBeHidden();
    await expect(mapLink).toContainText(name);
    await expect(sea).toContainText(name);

    // Away from the map and back: the banner still names it, and the bare map URL opens it.
    await page.goto("/admin/seasons");
    await expect(mapLink).toContainText(name);
    await mapLink.click();
    await page.waitForURL(`/?area=${id}`);
    await expect(sea).toContainText(name);
    await page.goto("/");
    await expect(sea).toContainText(name);

    // Escape closes the menu and gives focus back to its button.
    await toggle.click();
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(toggle).toBeFocused();
  } finally {
    await removeArea(page, id);
  }
});

test("on a phone the space name is cut short and the date bar still fits", async ({ page }) => {
  await ensureBeach(page);
  const name = `Spiaggia con un nome molto lungo ${Date.now() % 100_000}`;
  const id = await addArea(page, name);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?area=${id}`);
    const banner = page.locator("[data-banner]");
    const bannerRight = await banner.evaluate((el) => el.scrollWidth);
    expect(bannerRight, "banner overflows the phone").toBeLessThanOrEqual(390);
    const toggle = page.getByTestId("area-menu-toggle");
    const box = await toggle.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const sea = page.getByTestId("sea-band");
    await expect(sea).toContainText(name);
    // A wave on each side; a long name is cut short instead of pushing them off the band.
    await expect(sea.locator("svg")).toHaveCount(2);
    expect(await sea.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  } finally {
    await removeArea(page, id);
  }
});

test("a stale link opens the space last viewed; a removed space falls back to the first", async ({
  page,
}) => {
  await ensureBeach(page);
  const name = `Scogli ${Date.now() % 100_000}`;
  const id = await addArea(page, name);
  const sea = page.getByTestId("sea-band");
  let removed = false;
  try {
    await page.goto(`/?area=${id}`);
    await expect(sea).toContainText(name);
    for (const stale of ["999999999", "abc"]) {
      await page.goto(`/?area=${stale}`);
      // The redirect also names the day.
      await page.waitForURL(new RegExp(`/\\?area=${id}&date=`));
      await expect(page.getByTestId("area-menu-map")).toContainText(name);
    }
    await removeArea(page, id);
    removed = true;
    await page.goto("/");
    await expect(sea).not.toContainText(name);
    await expect(page.getByTestId("area-menu-map")).toHaveCount(0);
  } finally {
    if (!removed) await removeArea(page, id);
  }
});
