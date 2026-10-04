import { test, expect } from "@playwright/test";

// Read-only checks against the configured Supabase project: nothing here signs up, books or
// writes data.

const SEED_DOCTOR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";

test.describe("Public Routes", () => {
  test("homepage loads with CareConnect branding and real listings", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CareConnect/);
    await expect(page.getByRole("heading", { name: "Browse by specialty" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Doctors on CareConnect" })).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("head declares the CareConnect favicon and manifest", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    for (const asset of [
      "/favicon.svg",
      "/favicon.ico",
      "/apple-touch-icon.png",
      "/site.webmanifest",
    ]) {
      expect((await request.get(asset)).status(), asset).toBe(200);
    }
  });

  test("no assistant, language switcher or demo banner", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("article").first()).toBeVisible();
    await expect(page.getByText(/assistant/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /language/i })).toHaveCount(0);
    await expect(page.getByText(/demo prototype|fictional sample data/i)).toHaveCount(0);
    const html = await page.content();
    expect(html.toLowerCase()).not.toContain("lovable");
  });

  test("discover lists doctors and supports search", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: "Find doctors" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Specialty" })).toBeVisible();
    await expect(page.locator('[role="tabpanel"] article').first()).toBeVisible();

    await page.fill("#discover-search", "Pediatrician near Adyar");
    await expect(page).toHaveURL(/q=Pediatrician/);
    await expect(page.getByRole("tab", { name: /Doctors \(\d+\)/ })).toBeVisible();
  });

  test("hostile search input is handled safely by the real API", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.locator('[role="tabpanel"] article').first()).toBeVisible();
    for (const input of [
      `rao"),id.neq.(`,
      String.raw`a,b.c:d(e)f*g%h_i\j`,
      "சென்னை மருத்துவர்",
      "x".repeat(150),
    ]) {
      await page.fill("#discover-search", input);
      await expect(page.getByText(/Doctors \(\d+\)/)).toBeVisible();
      await expect(page.getByText("We couldn't load doctors")).toHaveCount(0);
    }
    // The input caps length; the URL never carries more than the cap.
    expect(new URL(page.url()).searchParams.get("q")?.length ?? 0).toBeLessThanOrEqual(100);
  });

  test("discover distinguishes a failed load from an empty result", async ({ page }) => {
    await page.route("**/*.supabase.co/**", (route) => route.abort("internetdisconnected"));
    await page.goto("/discover");
    await expect(page.getByText("We couldn't load doctors")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("No matching doctors")).toHaveCount(0);
  });

  test("login page loads correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to CareConnect" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /create an account/i })).toBeVisible();
  });

  test("invalid credentials show a clear message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody-careconnect-check@example.com");
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Incorrect email or password");
  });

  test("public doctor page loads", async ({ page }) => {
    await page.goto(`/doctors/${SEED_DOCTOR}`);
    await expect(page.getByRole("heading", { name: "Locations & availability" })).toBeVisible();
  });

  test("unknown doctor shows not found", async ({ page }) => {
    await page.goto("/doctors/does-not-exist");
    await expect(page.getByText("Doctor not found")).toBeVisible();
  });
});

test.describe("Protected Routes (Unauthenticated)", () => {
  for (const path of [
    "/profile",
    "/messages",
    "/appointments",
    "/clinic",
    `/book/${SEED_DOCTOR}`,
  ]) {
    test(`${path} redirects to login and back`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?redirect=/);
      expect(decodeURIComponent(new URL(page.url()).searchParams.get("redirect") ?? "")).toBe(path);
    });
  }
});

test.describe("UI States", () => {
  test("404 page handles invalid routes", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByText("404").first()).toBeVisible();
    await expect(page.getByText("Page not found").first()).toBeVisible();
    await expect(page).toHaveTitle("Page not found — CareConnect");
  });

  test("removed assistant route is gone", async ({ page }) => {
    await page.goto("/assistant");
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});

test.describe("Production hardening", () => {
  test("security headers are sent", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"];
    test.skip(!csp, "Security headers are added by the production (Nitro) server only");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("pages load without CSP violations or console errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /content security policy/i.test(m.text()))
        problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push(String(e)));
    for (const path of ["/", "/discover", "/login", "/doctors/does-not-exist"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });
});
