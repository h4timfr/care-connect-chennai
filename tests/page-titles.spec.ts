import { test, expect } from "./support/fixtures";
import { ids } from "./support/mock-backend";

test("short route titles update on direct loads and in-app navigation", async ({
  page,
  backend,
}) => {
  const mock = await backend({ platformAdmin: true });
  // Keep the title regression independent of external font availability.
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_admin", clinics: mock.state.clinics[0] },
  ];
  mock.state.doctors[0]!["user_id"] = ids.user;
  for (const [path, title] of [
    ["/", "CareConnect"],
    ["/discover", "Find doctors | CareConnect"],
    ["/appointments", "Appointments | CareConnect"],
    ["/messages", "Messages | CareConnect"],
    ["/clinic", "CareConnect | Clinic"],
    ["/clinic/messages", "Messages | CareConnect"],
    ["/doctor", "CareConnect | Doctor"],
    ["/doctor/appointments", "Appointments | CareConnect"],
    ["/doctor/messages", "Messages | CareConnect"],
    ["/admin", "CareConnect | Admin"],
    ["/profile", "CareConnect | Patient"],
  ]) {
    await page.goto(path!);
    await expect(page).toHaveTitle(title!);
  }
  await page.goto("/doctor");
  await page.getByRole("link", { name: "Appointments", exact: true }).first().click();
  await expect(page).toHaveTitle("Appointments | CareConnect");
});

test("app identity assets and manifest load locally", async ({ page, backend }) => {
  await backend({}, { signedIn: false });
  await page.goto("/");
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href", "/site.webmanifest");
  const manifestResponse = await page.request.get("/site.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: "CareConnect",
    short_name: "CareConnect",
    start_url: "/",
    display: "standalone",
  });
  for (const asset of [
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
  ]) {
    expect((await page.request.get(asset)).ok(), asset).toBe(true);
  }
});
