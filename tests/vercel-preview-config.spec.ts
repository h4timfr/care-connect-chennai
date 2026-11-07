import { expect, test } from "@playwright/test";

// Run separately with synthetic build-time values: this checks the actual bundled client wiring.
test("Preview rejects a Production target in the bundled client", async ({ page }) => {
  test.skip(
    process.env["CARECONNECT_PREVIEW_CONFIG_TEST"] !== "1",
    "Requires a synthetic Preview build",
  );
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/login");
  await expect
    .poll(() => errors)
    .toContainEqual(
      expect.stringContaining("Vercel Preview requires VITE_SUPABASE_TARGET=staging"),
    );
});
