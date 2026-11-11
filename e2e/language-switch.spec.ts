import { expect, test } from "@playwright/test";

test("switching language keeps form input, URL and survives reload", async ({ page }) => {
  await page.goto("/login");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "it");

  const heading = page.locator("h1");
  const italianTitle = (await heading.textContent())?.trim();
  expect(italianTitle).toBeTruthy();

  const username = page.locator('input[name="username"]');
  await username.fill("ciao");
  const url = page.url();

  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

  await page.getByLabel("Lingua").selectOption("en");

  await expect(html).toHaveAttribute("lang", "en");
  await expect(heading).not.toHaveText(italianTitle!);
  await expect(username).toHaveValue("ciao");
  expect(page.url()).toBe(url);
  const sameDocument = await page.evaluate(
    () => (window as unknown as { __noReload?: boolean }).__noReload === true,
  );
  expect(sameDocument, "switching must not trigger a full page reload").toBe(true);

  await page.reload();
  await expect(html).toHaveAttribute("lang", "en");

  await page.getByLabel("Language").selectOption("it");
  await expect(html).toHaveAttribute("lang", "it");
  await expect(heading).toHaveText(italianTitle!);
});

test("an invalid locale cookie falls back to Italian", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "locale", value: "fr", url: baseURL! }]);
  const response = await page.goto("/login");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
});
