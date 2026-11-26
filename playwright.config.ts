import { defineConfig, devices } from "@playwright/test";

import { ADMIN_STATE } from "./e2e/helpers";

const PHONE = { width: 390, height: 844 };

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /\.setup\.ts$/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /(phone|stock|area-menu)\.spec\.ts/,
    },
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        viewport: PHONE,
        screen: PHONE,
        storageState: ADMIN_STATE,
      },
      dependencies: ["setup"],
      testMatch: /phone\.spec\.ts/,
    },
    {
      // After the others: a second beach space changes the banner and tab order they check.
      name: "spaces",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["chromium", "phone"],
      testMatch: /area-menu\.spec\.ts/,
    },
    {
      // After every other spec: a stock set here would warn their bookings too (ADR 0021).
      name: "stock",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["chromium", "phone"],
      testMatch: /stock\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Every spec shares the admin account and runs in parallel: lift the per-minute limits.
    env: { RATE_LIMIT_MULTIPLIER: "100" },
  },
});
