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

for (const zone of [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "Europe/London",
  "Pacific/Honolulu",
]) {
  test(`India midnight, month/year boundaries and date-only display in ${zone}`, () => {
    const loader = new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
    const format = new URL("../src/lib/format.ts", import.meta.url).href;
    const appointments = new URL("../src/lib/appointment-time.ts", import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        loader,
        "--input-type=module",
        "-e",
        `
      import { addDays, isoDate, fullDate } from ${JSON.stringify(format)};
      import { isAppointmentInPast } from ${JSON.stringify(appointments)};
      console.log(JSON.stringify([
        isoDate(new Date('2026-12-31T18:29:59Z')),
        isoDate(new Date('2026-12-31T18:30:00Z')),
        isoDate(addDays(new Date('2026-01-31T18:00:00Z'), 1)),
        fullDate('2027-01-01'),
        isAppointmentInPast('2027-01-01', '00:00', new Date('2026-12-31T18:29:59Z')),
        isAppointmentInPast('2027-01-01', '00:00', new Date('2026-12-31T18:30:00Z'))
      ]));`,
      ],
      { env: { ...process.env, TZ: zone }, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      "2026-12-31",
      "2027-01-01",
      "2026-02-01",
      "1 January 2027",
      false,
      true,
    ]);
  });
}
