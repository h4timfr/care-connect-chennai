import { test as base, expect } from "@playwright/test";
import { mockBackend, type MockBackend, type MockState } from "./mock-backend";

/**
 * Playwright `test` for flows against the mocked backend (see mock-backend.ts). No request made
 * through it reaches a real Supabase project. Every test also fails on console errors (React
 * warnings such as hydration mismatches, unhandled rejections) and on requests the mock didn't
 * understand.
 */
export const test = base.extend<{
  backend: (
    state?: Partial<MockState>,
    options?: { signedIn?: boolean; expiredSession?: boolean },
  ) => Promise<MockBackend>;
  consoleErrors: string[];
}>({
  consoleErrors: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        // Failed requests the test provokes on purpose are logged by the browser itself.
        if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
          errors.push(m.text());
        }
      });
      await provide(errors);
      // No React warnings, unhandled rejections or app errors in any signed-in flow.
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
  backend: async ({ page }, provide) => {
    let installed: MockBackend | undefined;
    await provide(async (state = {}, options = {}) => {
      installed = await mockBackend(page, {
        state,
        signedIn: options.signedIn ?? true,
        expiredSession: options.expiredSession ?? false,
      });
      return installed;
    });
    // Every request must have been understood by the mock.
    expect(installed?.unhandled ?? []).toEqual([]);
  },
});

export { expect };
