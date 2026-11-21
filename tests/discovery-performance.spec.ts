import { LANGUAGE_COOKIE } from "../src/lib/i18n/languages";
import { en } from "../src/lib/i18n/messages/en";
import { ta } from "../src/lib/i18n/messages/ta";
import { expect, test } from "./support/fixtures";

const englishDictionaryAsset = /\/assets\/en-(?!shell-)[\w-]+\.js$/;

test("Discovery keeps its heading stable when the auth placeholder is retired", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.setViewportSize({ width: 1350, height: 940 });
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/assets/*.js", async (route) => {
    await scriptsReady;
    await route.fallback();
  });
  const heading = page.getByRole("heading", { name: en["discover.title"], exact: true });
  const welcome = page.getByRole("region", { name: en["welcome.title"] });
  let headingPosition;
  let placeholder;
  try {
    await page.goto("/discover", { waitUntil: "commit" });
    await expect(heading).toBeVisible();
    placeholder = await page.locator("header .animate-pulse[aria-hidden=true]").elementHandle();
    headingPosition = (await heading.boundingBox())!;
  } finally {
    releaseScripts();
  }
  await expect(page.getByRole("link", { name: en["nav.signIn"], exact: true })).toBeVisible();
  await expect(welcome).toBeVisible();
  // The animated skeleton must not be repurposed as the sign-in controls.
  expect(await placeholder!.evaluate((element) => element.isConnected)).toBe(false);
  const settled = (await heading.boundingBox())!;
  expect(Math.abs(settled.x - headingPosition.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(settled.y - headingPosition.y)).toBeLessThanOrEqual(1);
});

test("Home uses its server dictionary and keeps clinic workspace code off the initial page", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.goto("/");
  await expect(page.locator("#home-heading")).toBeVisible();
  await expect(page.getByRole("region", { name: en["welcome.title"] })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dr. Verified Tester", exact: true })).toBeVisible();

  const scripts = await page.evaluate(() => {
    const assets = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    return assets
      .filter(
        (asset) =>
          asset.name.startsWith(location.origin + "/assets/") && asset.name.endsWith(".js"),
      )
      .map((asset) => ({ path: new URL(asset.name).pathname, bytes: asset.decodedBodySize }));
  });
  expect(scripts.length).toBeGreaterThan(0);
  const assets = new Map(scripts.map(({ path, bytes }) => [path, bytes]));
  expect(
    [...assets.keys()].filter(
      (path) => englishDictionaryAsset.test(path) || path.startsWith("/assets/clinic-workspace-"),
    ),
  ).toEqual([]);
  expect([...assets.values()].reduce((total, bytes) => total + bytes, 0)).toBeLessThan(880_000);
});

test("a non-English first render loads the English dictionary on demand", async ({
  page,
  baseURL,
  backend,
}) => {
  await backend({}, { signedIn: false });
  if (!baseURL) throw new Error("Missing synthetic test URL.");
  await page.context().addCookies([{ name: LANGUAGE_COOKIE, value: "ta", url: baseURL }]);
  const englishRequests: string[] = [];
  page.on("request", (request) => {
    if (englishDictionaryAsset.test(new URL(request.url()).pathname)) {
      englishRequests.push(request.url());
    }
  });

  await page.goto("/discover");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ta["discover.title"]);
  await expect(page.getByRole("link", { name: "Dr. Verified Tester", exact: true })).toBeVisible();
  expect(englishRequests).toHaveLength(0);

  await page.getByRole("button", { name: /தமிழ்/ }).click();
  await page.getByRole("menuitemradio", { name: /English/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en["discover.title"]);
  expect(englishRequests).toHaveLength(1);
});

test("a failed language load leaves the current language and search usable", async ({
  page,
  baseURL,
  backend,
}) => {
  await backend({}, { signedIn: false });
  if (!baseURL) throw new Error("Missing synthetic test URL.");
  await page.context().addCookies([{ name: LANGUAGE_COOKIE, value: "ta", url: baseURL }]);
  await page.route(englishDictionaryAsset, (route) => route.abort());

  await page.goto("/discover");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ta["discover.title"]);
  await page.getByRole("button", { name: /தமிழ்/ }).click();
  await page.getByRole("menuitemradio", { name: /English/ }).click();

  await expect(page.getByText(ta["welcome.languageError"], { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ta-IN");
  await page.getByRole("searchbox").fill("Verified");
  await expect(page).toHaveURL(/q=Verified/);
});
