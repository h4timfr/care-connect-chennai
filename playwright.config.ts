import { defineConfig, devices } from "@playwright/test";

// The normal suite uses a reserved URL and a server built with dummy Supabase settings.
// The mocked suite never attaches to a caller-provided server: an existing server may have been
// built with real project credentials, including from the local .env file.
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const PORT = 4173;
const liveSmoke = process.env.PLAYWRIGHT_LIVE_SMOKE === "1";
const MOCK_SUPABASE_URL = "https://careconnect-test.invalid";
const MOCK_SUPABASE_KEY = "sb_publishable_local_test_only";

if (!liveSmoke) {
  if (externalBaseUrl) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL is disabled in mocked test mode; use the test-managed server.",
    );
  }
  process.env.VITE_SUPABASE_URL = MOCK_SUPABASE_URL;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = MOCK_SUPABASE_KEY;
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
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && node .output/server/index.mjs",
    env: {
      NITRO_PRESET: "node-server",
      PORT: String(PORT),
      ...(liveSmoke
        ? {}
        : {
            VITE_SUPABASE_URL: MOCK_SUPABASE_URL,
            VITE_SUPABASE_PUBLISHABLE_KEY: MOCK_SUPABASE_KEY,
          }),
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180000,
  },
});
