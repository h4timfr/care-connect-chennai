import { test, expect } from "@playwright/test";
import { appointmentRow, conversationRow, ids, mockBackend } from "./support/mock-backend";

// Layout check for every page at phone, tablet and desktop widths, against the mocked backend
// (tests/support/mock-backend.ts) so results don't depend on live data.

const VIEWPORTS = [
  { name: "phone-375", width: 375, height: 812 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

const PAGES = [
  "/",
  "/discover",
  "/discover?tab=clinics",
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
  "/providers",
  "/clinic/signup",
  "/doctor/signup",
  "/doctor/login",
  "/doctor",
  "/admin",
  "/clinic/login",
];

for (const viewport of VIEWPORTS) {
  test(`no horizontal overflow at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const mock = await mockBackend(page, {
      state: {
        appointments: [appointmentRow()],
        conversations: [
          conversationRow([
            { from: "patient", body: "Is there parking near the clinic?" },
            { from: "clinic", body: "Yes, there is parking behind the building." },
          ]),
        ],
      },
    });
    mock.state.memberships = [{ clinic_id: ids.clinicA, clinics: mock.state.clinics[0] }];

    const overflowing: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) overflowing.push(`${path} (+${overflow}px)`);
      await page.screenshot({
        path: testInfo.outputPath(`${path.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`),
        fullPage: true,
      });
    }
    expect(overflowing).toEqual([]);
    expect(mock.unhandled).toEqual([]);
  });
}
