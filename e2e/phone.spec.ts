import { expect, test, type Locator, type Page } from "@playwright/test";

// Runs in the `phone` project (390×844, touch). A year no other spec books in (they use 2090
// and 2091), and one day per test so the tests never take each other's umbrellas.
const DAYS = {
  sheet: "2092-07-01",
  twoSpots: "2092-07-02",
  quickBook: "2092-07-03",
  header: "2092-07-04",
  tapClosed: "2092-07-05",
  tapOpen: "2092-07-06",
  wide: "2092-07-07",
  recollapse: "2092-07-08",
  move: "2092-07-09",
  search: "2092-07-10",
};

// Selectors avoid translated text: another test switches the shared admin's language. Spot
// buttons are looked up inside the map: the activity panel below it is a list of buttons too.

/** Apple's and Google's minimum comfortable tap target, in CSS px. */
const MIN_TAP = 44;

function spotButton(page: Page, number: string) {
  const label = page.locator("span[aria-hidden]", { hasText: new RegExp(`^${number}$`) });
  return page.getByTestId("beach-map").locator("ol button", { has: label });
}

/** Free umbrellas have no caption (a customer's name) under the number. */
function freeSpots(page: Page) {
  return page
    .getByTestId("beach-map")
    .locator("ol button", { hasNot: page.locator("span.truncate") });
}

async function numberOf(spot: Locator): Promise<string> {
  return (await spot.locator("span[aria-hidden]").first().innerText()).trim();
}

/** The panel is a sheet fixed to the bottom of the viewport, at most 60% of its height. */
async function expectBottomSheet(page: Page, panel: Locator): Promise<void> {
  await expect(panel).toBeVisible();
  const position = await panel.evaluate((el) => getComputedStyle(el).position);
  expect(position, "the panel should be a fixed bottom sheet").toBe("fixed");
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("no bounding box or viewport");
  expect(Math.abs(box.y + box.height - viewport.height), "sheet bottom edge").toBeLessThanOrEqual(
    1,
  );
  expect(box.height, "sheet height").toBeLessThanOrEqual(viewport.height * 0.6);
}

/** Every visible control smaller than MIN_TAP×MIN_TAP, described for the assertion message. */
async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, summary';
    const offenders: string[] = [];
    for (const control of document.querySelectorAll<HTMLElement>(selector)) {
      if (!control.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const isToggle =
        control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type);
      // A checkbox is tapped through its label: measure what the finger actually hits.
      const target = (isToggle && control.closest("label")) || control;
      const { width, height } = target.getBoundingClientRect();
      if (width === 0 && height === 0) continue;
      if (width >= min && height >= min) continue;
      const name = control.getAttribute("name");
      const testId = control.getAttribute("data-testid");
      const text = (control.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
      const id = [
        control.tagName.toLowerCase(),
        control instanceof HTMLInputElement ? `[type=${control.type}]` : "",
        name ? `[name=${name}]` : "",
        testId ? `[data-testid=${testId}]` : "",
        control instanceof HTMLAnchorElement ? `[href=${control.getAttribute("href")}]` : "",
      ].join("");
      offenders.push(`${id} "${text}" ${Math.round(width)}×${Math.round(height)}`);
    }
    return offenders;
  }, MIN_TAP);
}

test("tapping a free umbrella opens the panel as a bottom sheet under the visible map", async ({
  page,
}) => {
  await page.goto(`/?date=${DAYS.sheet}`);
  await freeSpots(page).first().tap();

  const panel = page.locator("aside");
  await expect(panel.locator('input[name="customerName"]')).toBeVisible();
  await expectBottomSheet(page, panel);

  const map = page.getByTestId("beach-map");
  await expect(map).toBeInViewport();
  const mapBox = await map.boundingBox();
  const sheetBox = await panel.boundingBox();
  if (!mapBox || !sheetBox) throw new Error("no bounding box");
  expect(mapBox.y, "the map starts above the sheet").toBeLessThan(sheetBox.y);
});

test("with the sheet open a second umbrella joins the selection and both get booked", async ({
  page,
}) => {
  const customer = `Phone ${Date.now()}`;
  await page.goto(`/?date=${DAYS.twoSpots}`);
  const first = await numberOf(freeSpots(page).nth(0));
  const second = await numberOf(freeSpots(page).nth(1));

  await spotButton(page, first).tap();
  const panel = page.locator("aside");
  await expectBottomSheet(page, panel);
  // A plain tap: it fails if the sheet covers the umbrella and swallows the touch.
  await spotButton(page, second).tap();
  await expect(spotButton(page, first)).toHaveAttribute("aria-pressed", "true");
  await expect(spotButton(page, second)).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator('form select[name^="sunbeds-"]')).toHaveCount(2);

  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').tap();
  await expect(panel).toHaveCount(0);

  await page.goto(`/?date=${DAYS.twoSpots}`);
  for (const number of [first, second]) {
    await expect(spotButton(page, number)).toContainText(customer);
  }

  // A booked umbrella opens the same sheet, with the booking's details.
  await spotButton(page, first).tap();
  await expect(panel).toContainText(customer);
  await expectBottomSheet(page, panel);
});

test("quick book at phone width: suggest and confirm inside the sheet", async ({ page }) => {
  const customer = `Phone quick ${Date.now()}`;
  await page.goto(`/?date=${DAYS.quickBook}`);

  await page.getByTestId("quick-book-open").tap();
  const panel = page.locator("aside");
  await expectBottomSheet(page, panel);
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.getByTestId("quick-book-umbrellas").fill("1");
  await panel.getByTestId("quick-book-sunbeds").fill("2");
  await panel.getByTestId("quick-book-suggest").tap();

  const suggestion = panel.getByTestId("quick-book-suggestion");
  await expect(suggestion).toBeVisible();
  const [number = ""] = (await suggestion.innerText()).match(/\b\d{3}\b/g) ?? [];
  await expect(spotButton(page, number)).toHaveAttribute("aria-pressed", "true");
  await expectBottomSheet(page, panel);

  const form = panel.locator("form", { has: page.locator('input[name="customerName"]') });
  await expect(form.locator('input[name="customerName"]')).toHaveValue(customer);
  await form.locator('button[type="submit"]').tap();
  await expect(panel).toHaveCount(0);

  await page.goto(`/?date=${DAYS.quickBook}`);
  await expect(spotButton(page, number)).toContainText(customer);
});

test("sheet header collapses, expands and closes; Escape closes and focuses quick book", async ({
  page,
}) => {
  await page.goto(`/?date=${DAYS.header}`);
  const panel = page.locator("aside");
  const toggle = panel.locator("[data-sheet-toggle]");
  const close = panel.locator("[data-sheet-close]");
  const form = panel.locator("form");

  await freeSpots(page).first().tap();
  await expectBottomSheet(page, panel);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveJSProperty("tagName", "BUTTON");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(close).toBeVisible();

  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeVisible();
  await expect(form).toBeHidden();
  const collapsed = await panel.boundingBox();
  expect(collapsed?.height ?? Infinity, "collapsed sheet height").toBeLessThan(100);

  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(form).toBeVisible();

  await close.tap();
  await expect(form).toHaveCount(0);

  await freeSpots(page).first().tap();
  await panel.locator('input[name="customerName"]').focus();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => ((await panel.count()) === 0 ? "" : (await panel.innerText()).trim()), {
      message: "Escape should close the sheet",
    })
    .toBe("");
  await expect(page.getByTestId("quick-book-open")).toBeFocused();
});

test("a collapsed sheet stays collapsed while umbrellas are toggled, and opens expanded next time", async ({
  page,
}) => {
  await page.goto(`/?date=${DAYS.recollapse}`);
  const panel = page.locator("aside");
  const toggle = panel.locator("[data-sheet-toggle]");
  const [first, second] = [freeSpots(page).nth(0), freeSpots(page).nth(1)];
  const [firstNumber, secondNumber] = [await numberOf(first), await numberOf(second)];

  await first.tap();
  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await spotButton(page, secondNumber).tap();
  await expect(toggle, "adding an umbrella keeps the sheet folded").toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await panel.locator("[data-sheet-close]").tap();
  await expect(panel).toHaveCount(0);
  await spotButton(page, firstNumber).tap();
  await expect(toggle, "a new booking opens expanded").toHaveAttribute("aria-expanded", "true");

  await toggle.tap();
  await panel.locator("[data-sheet-close]").tap();
  await page.getByTestId("quick-book-open").tap();
  await expect(toggle, "quick book opens expanded").toHaveAttribute("aria-expanded", "true");
});

test("every control on the map page is at least 44×44 with the sheet closed", async ({ page }) => {
  await page.goto(`/?date=${DAYS.tapClosed}`);
  await expect(page.getByTestId("beach-map")).toBeVisible();
  const offenders = await smallTapTargets(page);
  expect(offenders, `tap targets under ${MIN_TAP}px:\n${offenders.join("\n")}`).toEqual([]);
});

test("every control on the map page is at least 44×44 with the booking sheet open", async ({
  page,
}) => {
  await page.goto(`/?date=${DAYS.tapOpen}`);
  await freeSpots(page).first().tap();
  await expect(page.locator('aside input[name="customerName"]')).toBeVisible();
  const offenders = await smallTapTargets(page);
  expect(offenders, `tap targets under ${MIN_TAP}px:\n${offenders.join("\n")}`).toEqual([]);
});

for (const size of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]) {
  test(`at ${size.width}×${size.height} the panel is not a sheet and has no sheet header`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto(`/?date=${DAYS.wide}`);
    await freeSpots(page).first().tap();

    const panel = page.locator("aside");
    await expect(panel.locator('input[name="customerName"]')).toBeVisible();
    const position = await panel.evaluate((el) => getComputedStyle(el).position);
    expect(position, "the side panel keeps its layout").not.toBe("fixed");
    await expect(panel.locator("[data-sheet-toggle]")).toBeHidden();
    await expect(panel.locator("[data-sheet-close]")).toBeHidden();
  });
}

test("moving a booking at phone width: tap the new umbrella with the sheet open", async ({
  page,
}) => {
  const customer = `Phone move ${Date.now()}`;
  await page.goto(`/?date=${DAYS.move}`);
  const from = await numberOf(freeSpots(page).nth(0));
  const to = await numberOf(freeSpots(page).nth(1));
  const panel = page.locator("aside");
  await spotButton(page, from).tap();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').tap();
  await expect(panel).toHaveCount(0);

  await spotButton(page, from).tap();
  await panel.getByTestId("move-open").tap();
  await expectBottomSheet(page, panel);
  // A plain tap: it fails if the sheet covers the umbrella and swallows the touch.
  await spotButton(page, to).tap();
  await expect(spotButton(page, to)).toHaveAttribute("aria-pressed", "true");
  expect(await smallTapTargets(page)).toEqual([]);
  await panel.locator('[data-testid="move-form"] button[type="submit"]').tap();
  await expect(panel).toHaveCount(0);

  await page.goto(`/?date=${DAYS.move}`);
  await expect(spotButton(page, to)).toContainText(customer);
  await expect(spotButton(page, from)).not.toContainText(customer);
});

test("search at phone width opens the booking as a bottom sheet on its day", async ({ page }) => {
  const customer = `Phone search ${Date.now()}`;
  await page.goto(`/?date=${DAYS.search}`);
  const panel = page.locator("aside");
  await freeSpots(page).first().tap();
  await panel.locator('input[name="customerName"]').fill(customer);
  await panel.locator('form button[type="submit"]').tap();
  await expect(panel).toHaveCount(0);

  await page.goto("/");
  expect(await smallTapTargets(page)).toEqual([]);
  await page.getByRole("search").locator('input[name="q"]').fill(customer);
  await page.getByRole("search").locator('button[type="submit"]').tap();
  await page.getByTestId("search-result").tap();
  await page.waitForURL(new RegExp(`date=${DAYS.search}`));
  await expectBottomSheet(page, panel);
  await expect(panel).toContainText(customer);
});
