import { test as setup } from "@playwright/test";

import { ADMIN_STATE, ensureBeach, logIn } from "./helpers";

// One sign-in shared by the specs that only need a logged-in admin: sign-in is rate-limited
// to 5 per minute per address (src/lib/auth/auth.ts); login.spec.ts and communal.spec.ts each have
// their own address, so this one is the only sign-in from the default one.
setup("log in as admin with a beach set up", async ({ page }) => {
  await logIn(page);
  await ensureBeach(page);
  await page.context().storageState({ path: ADMIN_STATE });
});
