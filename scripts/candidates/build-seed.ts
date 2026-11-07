/*
 * Validates the provider research catalogue and writes the candidate import SQL.
 *
 *   npm run candidates:seed -- --fixture research/chennai-provider-candidates.json --out <file.sql>
 *
 * Options:
 *   --check            validate only, write nothing
 *   --allow-partial    skip the commissioned totals (100 facilities / 399 doctors /
 *                      418 relationships, 418 CONFIRMED_PUBLIC / 0 POSSIBLE_NEEDS_CONFIRMATION)
 *
 * The SQL is never applied automatically. Review it, run it on staging as the database owner, then
 * production. It creates RESEARCH CANDIDATES only (migration 00056): not providers, not bookable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSeedSql, validateCatalogue, type Catalogue } from "./catalogue";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fixture = arg("--fixture") ?? "research/chennai-provider-candidates.json";
const out = arg("--out");
const check = process.argv.includes("--check");
const allowPartial = process.argv.includes("--allow-partial");

let data: unknown;
try {
  data = JSON.parse(readFileSync(fixture, "utf8"));
} catch (err) {
  console.error(`Cannot read ${fixture}: ${String(err)}`);
  process.exit(2);
}

const result = validateCatalogue(data, allowPartial ? null : undefined);
const c = result.counts;
console.log(
  `${fixture}: ${c.facilities} facilities, ${c.doctors} doctors, ${c.relationships} relationships ` +
    `(${c.confirmedPublic} CONFIRMED_PUBLIC, ${c.possibleNeedsConfirmation} POSSIBLE_NEEDS_CONFIRMATION)`,
);
for (const w of result.warnings) console.warn(`warning: ${w}`);
if (result.errors.length) {
  for (const e of result.errors) console.error(`error: ${e}`);
  console.error(`\n${result.errors.length} problem(s). Nothing was written.`);
  process.exit(1);
}
if (check) {
  console.log("Catalogue is valid.");
  process.exit(0);
}
if (!out) {
  console.error("Pass --out <file.sql> to write the import SQL (or --check to validate only).");
  process.exit(2);
}
writeFileSync(out, buildSeedSql(data as Catalogue, fixture));
console.log(`Wrote ${out}. Review it, then run it as the database owner on staging first.`);
