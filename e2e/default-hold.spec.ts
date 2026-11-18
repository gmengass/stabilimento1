import { expect, test } from "@playwright/test";

import itMessages from "../messages/it.json";
import { ADMIN_STATE, ensureBeach } from "./helpers";

test.use({ storageState: ADMIN_STATE });

const t = itMessages.beachSetup;

// The job flags only a booking made before the hold instant, and only when a run crosses it, so
// the few seconds at 12:45 can't flag a booking another spec makes meanwhile.
test("an admin changes the check-in time for day bookings, and it stays after reload", async ({
  page,
}) => {
  await ensureBeach(page);
  await page.goto("/admin/beach");
  const form = page.locator('form:has(input[name="defaultHoldUntil"])');
  const time = form.getByLabel(t.defaultHold);
  await expect(time).toHaveValue("11:00");

  try {
    await time.fill("12:45");
    await form.getByRole("button", { name: t.save }).click();
    await expect(form.getByRole("status")).toHaveText(t.saved);
    await page.reload();
    await expect(time).toHaveValue("12:45");
  } finally {
    await time.fill("11:00");
    await form.getByRole("button", { name: t.save }).click();
    await expect(form.getByRole("status")).toHaveText(t.saved);
  }
});
