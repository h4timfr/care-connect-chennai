import { defineConfig, devices } from "@playwright/test";

// Set PLAYWRIGHT_BASE_URL to test an already-running server (e.g. `npm run dev` on :8080).
// Otherwise the suite builds the app for Node and serves the production build on :4173.
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const PORT = 4173;
const liveSmoke = process.env.PLAYWRIGHT_LIVE_SMOKE === "1";
if (!liveSmoke) {
  // Browser fixtures intercept this reserved domain. A normal test run must never inherit a
  // production .env and accidentally contact its Supabase project.
  process.env.VITE_SUPABASE_URL = "https://careconnect-test.invalid";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_local_test_only";
}

export default defineConfig({
  testDir: "./tests",
  // Only *.spec.ts. tests/security.test.ts is a manual script that creates real accounts in the
  // configured Supabase project and must never run as part of this suite.
  testMatch: liveSmoke ? "**/app.spec.ts" : "**/*.spec.ts",
  testIgnore: liveSmoke ? undefined : "**/app.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run build && node .output/server/index.mjs",
        env: { NITRO_PRESET: "node-server", PORT: String(PORT) },
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180000,
      },
});
