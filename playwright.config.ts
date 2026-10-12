import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 2,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.ROUNDRELAY_URL ?? "http://127.0.0.1:4180",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    ...(process.env.ROUNDRELAY_ALL_BROWSERS
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
  webServer: process.env.ROUNDRELAY_URL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 4180 --strictPort",
        url: "http://127.0.0.1:4180",
        reuseExistingServer: false,
      },
});
