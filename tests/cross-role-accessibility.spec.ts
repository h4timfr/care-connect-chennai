import { expect, test } from "./support/fixtures";
import { appointmentRow, defaultState, ids } from "./support/mock-backend";

test("provider profiles keep discovery active in patient navigation", async ({ page, backend }) => {
  await backend({}, { signedIn: false });
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of [`/doctors/${ids.doctorVerified}`, `/clinics/${ids.clinicA}`]) {
      await page.goto(route);
      const nav = page.getByRole("navigation", {
        name: width < 1024 ? "Primary mobile" : "Primary",
        exact: true,
      });
      const active = nav.locator('[aria-current="page"]');
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute("href", "/discover");
    }
  }
});

for (const role of ["clinic", "doctor"] as const) {
  test(`${role} mobile navigation exposes sign out and keyboard focus`, async ({
    page,
    backend,
  }) => {
    const state = defaultState();
    if (role === "doctor") state.doctors[0]!["user_id"] = ids.user;
    await backend({
      doctors: state.doctors,
      memberships:
        role === "clinic"
          ? [
              {
                clinic_id: ids.clinicA,
                role: "clinic_staff",
                active: true,
                clinics: state.clinics[0],
              },
            ]
          : [],
    });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/${role}`);
    const nav = page.getByRole("navigation", {
      name: role === "clinic" ? "Clinic mobile" : "Doctor portal sections",
    });
    const links = nav.getByRole("link");
    await links.first().focus();
    await page.keyboard.press("Tab");
    const next = links.nth(1);
    await expect(next).toBeFocused();
    expect(await next.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    const signOut = nav.getByRole("button", { name: "Sign out" });
    await expect(signOut).toBeVisible();
    await signOut.click();
    await expect(page).toHaveURL(new RegExp(`/${role}/login`));
  });
}

test("clinic portal entry waits for membership resolution", async ({ page, backend }) => {
  const state = defaultState();
  await backend({
    memberships: [
      { clinic_id: ids.clinicA, role: "clinic_staff", active: true, clinics: state.clinics[0] },
    ],
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/clinic_memberships?*", async (route) => {
    await gate;
    await route.fallback();
  });
  try {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Clinic portal" })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole("link", { name: "Clinic portal" })).toBeVisible();
});

test("confirmation remains usable on a short viewport with long provider text", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  state.doctors[0]!["name"] = "SyntheticDoctor".repeat(18);
  await backend({ doctors: state.doctors, appointments: [appointmentRow()] });
  await page.setViewportSize({ width: 320, height: 300 });
  await page.goto("/appointments");
  const trigger = page.getByRole("button", { name: "Cancel appointment" });
  await trigger.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  const dimensions = await dialog.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
    scroll: el.scrollHeight,
    client: el.clientHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(320);
  expect(dimensions.height).toBeLessThanOrEqual(300);
  expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("patient mobile navigation labels wrap in all supported languages", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.setViewportSize({ width: 320, height: 800 });
  const baseURL = test.info().project.use.baseURL!;
  for (const lang of ["en", "hi", "ml", "ta", "te", "ur"]) {
    await page.context().addCookies([{ name: "cc_lang", value: lang, url: baseURL }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${lang}(?:-|$)`));
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ur" ? "rtl" : "ltr");
    const nav = page.locator("nav").last();
    await expect(nav).toBeVisible();
    const metrics = await nav.evaluate((el) => ({
      width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      height: el.getBoundingClientRect().height,
      clipped: [...el.querySelectorAll("li span")].some(
        (label) => label.scrollWidth > label.clientWidth + 1,
      ),
    }));
    expect(metrics.width, lang).toBeLessThanOrEqual(1);
    expect(metrics.height, lang).toBeLessThanOrEqual(128);
    expect(metrics.clipped, lang).toBe(false);
    if (lang === "ur") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  }
});

test("clinic desktop offers direct sign out", async ({ page, backend }) => {
  const state = defaultState();
  await backend({
    memberships: [
      { clinic_id: ids.clinicA, role: "clinic_staff", active: true, clinics: state.clinics[0] },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/clinic");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/clinic\/login/);
});
