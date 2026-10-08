import { test, expect } from "@playwright/test";
import { appointmentRow, conversationRow, ids, mockBackend } from "./support/mock-backend";

// Structural accessibility checks on every page (mocked backend, see tests/support/mock-backend.ts):
// named controls, labelled fields, one <h1>, no positive tabindex, and no click handlers on
// elements a keyboard can't reach.

const PAGES = [
  "/",
  "/discover",
  `/doctors/${ids.doctorVerified}`,
  `/clinics/${ids.clinicA}`,
  `/book/${ids.doctorVerified}`,
  "/appointments",
  `/appointments/${ids.appointment}`,
  `/messages?c=${ids.conversation}`,
  "/profile",
  "/clinic",
  "/clinic/appointments",
  "/clinic/calendar",
  "/clinic/patients",
  "/clinic/doctors",
  `/clinic/messages?c=${ids.conversation}`,
  "/clinic/profile",
];

test("every page meets the structural accessibility checks", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await mockBackend(page, {
    state: {
      appointments: [appointmentRow()],
      conversations: [conversationRow([{ from: "clinic", body: "Hello" }])],
    },
  });
  mock.state.memberships = [{ clinic_id: ids.clinicA, clinics: mock.state.clinics[0] }];

  const problems: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const found = await page.evaluate(() => {
      const issues: string[] = [];
      const visible = (el: Element) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden";
      };
      const nameOf = (el: Element) => {
        const labelledBy = el.getAttribute("aria-labelledby");
        const fromIds = labelledBy
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ");
        const labels = (el as HTMLInputElement).labels
          ? [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent ?? "").join(" ")
          : "";
        return [
          el.getAttribute("aria-label"),
          fromIds,
          labels,
          el.textContent,
          el.getAttribute("title"),
          el.querySelector("img[alt]")?.getAttribute("alt"),
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
      };
      const describe = (el: Element) =>
        `<${el.tagName.toLowerCase()} ${(el.getAttribute("class") ?? "").slice(0, 40)}>`;

      for (const el of document.querySelectorAll("button, a[href], [role=button], [role=tab]")) {
        if (visible(el) && !nameOf(el)) issues.push(`unnamed control ${describe(el)}`);
      }
      for (const el of document.querySelectorAll(
        "input:not([type=hidden]), textarea, select, [role=slider]",
      )) {
        if (visible(el) && !nameOf(el)) issues.push(`unlabelled field ${describe(el)}`);
      }
      for (const el of document.querySelectorAll("img")) {
        if (!el.hasAttribute("alt")) issues.push(`image without alt ${describe(el)}`);
      }
      const h1s = [...document.querySelectorAll("h1")].filter(visible);
      if (h1s.length !== 1) issues.push(`expected one <h1>, found ${h1s.length}`);
      for (const el of document.querySelectorAll("[tabindex]")) {
        if (Number(el.getAttribute("tabindex")) > 0)
          issues.push(`positive tabindex ${describe(el)}`);
      }
      for (const el of document.querySelectorAll("[onclick]")) {
        issues.push(`inline onclick ${describe(el)}`);
      }
      if (!document.documentElement.lang) issues.push("missing <html lang>");
      return issues;
    });
    problems.push(...found.map((issue) => `${path}: ${issue}`));
  }
  expect(problems).toEqual([]);
  expect(mock.unhandled).toEqual([]);
});

test("the skip link is the first stop and moves focus to the main content", async ({ page }) => {
  await mockBackend(page, { signedIn: false });
  await page.goto("/discover");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await page.keyboard.press("Tab");
  // The next stop is inside <main> (the search box), not back in the header.
  await expect(page.locator("#discover-search")).toBeFocused();
});

test("the cancel dialog works by keyboard and returns focus", async ({ page }) => {
  await mockBackend(page, { state: { appointments: [appointmentRow()] } });
  await page.goto("/appointments");
  const trigger = page.getByRole("button", { name: "Cancel appointment" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep appointment" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("navigating to another page moves focus to its main content", async ({ page }) => {
  await mockBackend(page, { signedIn: false });
  await page.goto("/");
  // Wait for hydration so the click is a client-side navigation, not a full page load.
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Find doctors", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.locator("#main-content")).toBeFocused();

  // Changing a filter stays on the same page, so focus stays on the control.
  const female = page.getByRole("button", { name: "Female" });
  await female.click();
  await expect(page).toHaveURL(/gender=female/);
  await expect(female).toBeFocused();
});

test("pages reachable while signed out also pass", async ({ page }) => {
  await mockBackend(page, { signedIn: false });
  for (const path of ["/login", "/login?signup=true", "/reset-password", "/does-not-exist"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const h1Count = await page.locator("h1:visible").count();
    expect(h1Count, `${path} should have one <h1>`).toBe(1);
    const unlabelled = await page
      .locator("input:visible")
      .evaluateAll((els) =>
        els.filter(
          (el) => !(el as HTMLInputElement).labels?.length && !el.getAttribute("aria-label"),
        ),
      );
    expect(unlabelled, `${path} has unlabelled inputs`).toHaveLength(0);
  }
});
