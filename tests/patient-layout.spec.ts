import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { conversationRow, ids } from "./support/mock-backend";

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

for (const width of [320, 375, 390, 768, 1440]) {
  test(`signed-out catalogue stays compact at ${width}px`, async ({ page, backend }) => {
    await backend({ doctors: [], clinics: [] }, { signedIn: false });
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 768 ? "dark" : "light" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(width === 768 ? /\bdark\b/ : /\blight\b/);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();

    const hero = page.getByRole("region", { name: "Find a doctor in Chennai" });
    await expect(hero.getByRole("searchbox")).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const height = (await hero.boundingBox())!.height;
    test.info().annotations.push({ type: "hero-height-px", description: String(height) });
    await test
      .info()
      .attach("catalogue-hero", { body: await hero.screenshot(), contentType: "image/png" });
    expect(height).toBeLessThan(230);

    const doctors = page.getByRole("heading", { name: "No doctors listed yet" });
    const clinics = page.getByRole("heading", { name: "No clinics listed yet" });
    await expect(doctors).toBeVisible();
    await expect(clinics).toBeVisible();
    if (width >= 375)
      expect((await doctors.locator("../..").boundingBox())!.height).toBeLessThan(110);
    const doctorsBox = (await doctors.boundingBox())!;
    const clinicsBox = (await clinics.boundingBox())!;
    if (width >= 768) {
      expect(clinicsBox.x).toBeGreaterThan(doctorsBox.x + doctorsBox.width);
    } else {
      expect(clinicsBox.y).toBeGreaterThan(doctorsBox.y);
    }
    await expectNoHorizontalOverflow(page);

    await hero.getByRole("searchbox").press("Enter");
    await expect(page.getByRole("heading", { name: "Find doctors", level: 1 })).toBeVisible();
    await expect(page.getByText("No doctors are listed on CareConnect yet.")).toBeVisible();
    await page.getByRole("tab", { name: "Doctors (0)" }).press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Clinics (0)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  for (const language of ["ta", "ur"]) {
    test(`catalogue hero remains readable in ${language} at ${width}px`, async ({
      page,
      backend,
    }) => {
      await backend({ doctors: [], clinics: [] }, { signedIn: false });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (locale) => localStorage.setItem("careconnect.language", locale),
        language,
      );
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        language === "ta" ? "ta-IN" : "ur",
      );
      await expect(page.locator("html")).toHaveAttribute("dir", language === "ur" ? "rtl" : "ltr");
      const hero = page.locator("section[aria-labelledby=home-heading]");
      await expect(hero.getByRole("searchbox")).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expectNoHorizontalOverflow(page);
      expect(
        await hero.evaluate((node) => node.scrollWidth - node.clientWidth),
      ).toBeLessThanOrEqual(1);
      const height = (await hero.boundingBox())!.height;
      test.info().annotations.push({ type: "hero-height-px", description: String(height) });
      await test
        .info()
        .attach("catalogue-hero", { body: await hero.screenshot(), contentType: "image/png" });
      await hero.getByRole("searchbox").press("Enter");
      await expect(page).toHaveURL(/\/discover/);
    });
  }
}

for (const width of [375, 768, 1440]) {
  test(`signed-in patient layouts keep actions usable at ${width}px`, async ({ page, backend }) => {
    await backend({
      conversations: [conversationRow([{ from: "clinic", body: "Hello from the clinic" }])],
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "My appointments", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Find a doctor", exact: true })).toBeVisible();
    const empty = page.getByRole("heading", { name: "No upcoming appointments" });
    expect((await empty.locator("../..").boundingBox())!.height).toBeLessThan(140);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/messages?c=${ids.conversation}`);
    await expect(page.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible();
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(composer).toBeInViewport({ ratio: 1 });
    await composer.fill("Local layout check");
    await composer.press("Tab");
    const send = page.getByRole("button", { name: "Send message" });
    await expect(send).toBeFocused();
    if (width < 1024) {
      const bottomNav = page.getByRole("navigation", { name: "Primary mobile" });
      const sendBox = (await send.boundingBox())!;
      expect(sendBox.y + sendBox.height).toBeLessThan((await bottomNav.boundingBox())!.y);
    }
    await expectNoHorizontalOverflow(page);

    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    const details = page.getByRole("region", { name: "Personal details" });
    const saved = page.getByRole("region", { name: "Saved doctors" });
    await expect(details.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(saved).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    const detailsBox = (await details.boundingBox())!;
    const savedBox = (await saved.boundingBox())!;
    if (width >= 768) {
      expect(savedBox.x).toBeGreaterThan(detailsBox.x + detailsBox.width);
    } else {
      expect(savedBox.y).toBeGreaterThan(detailsBox.y + detailsBox.height);
    }
    await expectNoHorizontalOverflow(page);
  });
}
