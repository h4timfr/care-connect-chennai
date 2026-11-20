import type { Locator } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { defaultState, ids, TEST_EMAIL } from "./support/mock-backend";

async function readBackdrop(content: Locator, isCard = false) {
  return content.evaluate((element, card) => {
    let hasOpaqueWrapper = false;
    for (
      let wrapper = card ? element.parentElement : element;
      wrapper && wrapper !== document.body;
      wrapper = wrapper.parentElement
    ) {
      const style = getComputedStyle(wrapper);
      if (style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.backgroundImage !== "none") {
        hasOpaqueWrapper = true;
        break;
      }
    }
    const style = getComputedStyle(element);
    return {
      image: getComputedStyle(document.body).backgroundImage,
      hasOpaqueWrapper,
      cardHasSurface: card && style.backgroundColor !== "rgba(0, 0, 0, 0)",
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  }, isCard);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [375, 1440]) {
    test(`the ${theme} login backdrop stays visible across CareConnect at ${width}px`, async ({
      page,
      backend,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      const state = defaultState();
      state.doctors[0]!["user_id"] = ids.user;
      await backend(
        {
          platformAdmin: true,
          doctors: state.doctors,
          memberships: [
            {
              clinic_id: ids.clinicA,
              role: "clinic_admin",
              active: true,
              clinics: state.clinics[0],
            },
          ],
        },
        { signedIn: false },
      );

      await page.goto("/login");
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
      const authCard = page.locator(".surface-raised");
      const login = await readBackdrop(authCard, true);
      expect(login.image).toMatch(/^linear-gradient\(/);
      expect(login).toMatchObject({
        hasOpaqueWrapper: false,
        cardHasSurface: true,
        hasHorizontalOverflow: false,
      });

      for (const route of ["/clinic/signup", "/doctor/signup"]) {
        await page.goto(route);
        expect(await readBackdrop(authCard, true)).toEqual(login);
      }

      const main = page.locator("main#main-content");
      const checkMain = async () => {
        await expect(main).toBeVisible();
        expect(await readBackdrop(main)).toEqual({
          ...login,
          cardHasSurface: false,
        });
      };
      for (const route of ["/", "/discover", "/providers"]) {
        await page.goto(route);
        await checkMain();
      }

      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill(TEST_EMAIL);
      await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      for (const route of ["/appointments", "/clinic", "/doctor", "/admin"]) {
        await page.goto(route);
        await checkMain();
        await expect(page).toHaveURL(new RegExp(`${route}/?$`));
      }
    });
  }
}
