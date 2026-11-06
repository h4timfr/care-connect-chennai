import { test, expect } from "./support/fixtures";
import {
  appointmentRow,
  conversationRow,
  defaultState,
  enablePatientContact,
  ids,
  mockBackend,
} from "./support/mock-backend";

// Layout check for every page at phone, tablet and desktop widths, against the mocked backend
// (tests/support/mock-backend.ts) so results don't depend on live data.

const VIEWPORTS = [
  { name: "phone-320", width: 320, height: 812 },
  { name: "phone-375", width: 375, height: 812 },
  { name: "phone-430", width: 430, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "desktop-1024", width: 1024, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
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
  "/doctor/appointments",
  "/doctor/messages",
  "/doctor/schedule",
  "/doctor/profile",
  "/admin",
  "/admin/providers",
  "/clinic/login",
];

for (const viewport of VIEWPORTS) {
  test(`no horizontal overflow at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const state = defaultState();
    enablePatientContact(state, ids.clinicA, true);
    state.doctors[0]!["user_id"] = ids.user;
    const mock = await mockBackend(page, {
      state: {
        doctors: state.doctors,
        clinics: state.clinics,
        platformAdmin: true,
        appointments: [appointmentRow()],
        conversations: [
          conversationRow([
            { from: "patient", body: "Is there parking near the clinic?" },
            { from: "clinic", body: "Yes, there is parking behind the building." },
          ]),
        ],
      },
    });
    mock.state.memberships = [
      { clinic_id: ids.clinicA, role: "clinic_admin", clinics: mock.state.clinics[0] },
    ];

    const overflowing: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path.startsWith("/book/")) {
        await expect(page.getByRole("button", { name: "Request appointment" })).toBeVisible();
      }
      if (path === "/clinic" && viewport.width === 320) {
        const label = await page
          .getByText("Awaiting confirmation", { exact: true })
          .first()
          .boundingBox();
        expect(label?.height).toBeLessThanOrEqual(24);
      }
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
