import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";

for (const [base, expected] of [
  ["2026-03-07T19:00:00Z", "2026-03-09"],
  ["2026-10-31T18:00:00Z", "2026-11-01"],
]) {
  test(`India booking calendar advances one day across viewer DST at ${base}`, () => {
    const loader = new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
    const module = pathToFileURL(
      fileURLToPath(new URL("../src/lib/format.ts", import.meta.url)),
    ).href;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        loader,
        "--input-type=module",
        "-e",
        `import { addDays, isoDate } from ${JSON.stringify(module)}; console.log(isoDate(addDays(new Date(${JSON.stringify(base)}), 1)));`,
      ],
      { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  });
}
