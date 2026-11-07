import { defineConfig, devices } from "@playwright/test";

const localUrl = process.env["VITE_SUPABASE_URL"];
const publicKey = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
const baseURL = process.env["PLAYWRIGHT_REAL_SERVICE_BASE_URL"];

if (process.env["CARECONNECT_REAL_SERVICE"] !== "1") {
  throw new Error("Real-service browser tests require the dedicated disposable-stack runner.");
}
if (!localUrl || !publicKey || !baseURL) {
  throw new Error("Local Supabase URL, publishable key, and application URL are required.");
}
for (const [label, raw, port] of [
  ["Supabase", localUrl, "54321"],
  ["application", baseURL, "4173"],
] as const) {
  const url = new URL(raw);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    url.port !== port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} target must be the expected loopback service.`);
  }
}

export default defineConfig({
  testDir: "./tests/real-service",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npm run build && node .output/server/index.mjs",
    env: {
      NITRO_PRESET: "node-server",
      PORT: "4173",
      VITE_SUPABASE_URL: localUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
    },
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
