"use strict";
const { defineConfig, devices } = require("@playwright/test");
const path = require("node:path");
module.exports = defineConfig({
  testDir: path.join(__dirname, "browser"),
  outputDir: path.join(__dirname, "../test-results"),
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:4178",
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node tests/helpers/server.cjs",
    cwd: path.resolve(__dirname, ".."),
    url: "http://127.0.0.1:4178",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
