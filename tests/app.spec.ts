import { test, expect } from "@playwright/test";

test.describe("Public Routes", () => {
  test("homepage loads and displays hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=CareConnect").first()).toBeVisible();
    await expect(page.locator("text=Featured Doctors").first()).toBeVisible();
  });

  test("discover page loads and shows filters", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.locator("text=Find").first()).toBeVisible();
    await expect(page.locator("text=Specialty").first()).toBeVisible();
  });

  test("login page loads correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=Sign In").first()).toBeVisible();
    await expect(page.locator("button", { hasText: "Create Account" }).first()).toBeVisible();
  });

  test("public doctor page loads", async ({ page }) => {
    test.skip(true, "Intentionally skipped: d1 is not a valid UUID in production seed data");
    await page.goto("/doctors/d1");
    // Should show error state or loading, but not crash
    await expect(page.locator("body")).toBeVisible();
  });

  test("public clinic page loads", async ({ page }) => {
    test.skip(true, "Intentionally skipped: c1 is not a valid UUID in production seed data");
    await page.goto("/clinics/c1");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Protected Routes (Unauthenticated)", () => {
  test("profile redirects to login", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/.*\/login.*/);
  });

  test("messages redirects to login", async ({ page }) => {
    await page.goto("/messages");
    await expect(page).toHaveURL(/.*\/login.*/);
  });

  test("appointments redirects to login", async ({ page }) => {
    await page.goto("/appointments");
    await expect(page).toHaveURL(/.*\/login.*/);
  });

  test("clinic dashboard redirects to login", async ({ page }) => {
    await page.goto("/clinic");
    await expect(page).toHaveURL(/.*\/login.*/);
  });

  test("booking flow redirects to login", async ({ page }) => {
    await page.goto("/book/d1?date=2030-01-01&time=10:00&clinicId=c1");
    await expect(page).toHaveURL(/.*\/login.*/);
  });
});

test.describe("UI States", () => {
  test("404 page handles invalid routes", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.locator("text=404").first()).toBeVisible();
    await expect(page.locator("text=Page not found").first()).toBeVisible();
  });
});
