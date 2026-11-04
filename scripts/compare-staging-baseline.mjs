import { readFileSync } from "node:fs";

const required = [
  "schemas",
  "enums",
  "tables",
  "columns",
  "constraints",
  "indexes",
  "policies",
  "functions",
  "triggers",
  "relation_grants",
  "column_grants",
  "publication",
];

const canonicalize = (value) =>
  Array.isArray(value)
    ? value.map(canonicalize)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonicalize(value[key])]),
        )
      : value;

const args = process.argv.slice(2);
if (args.length !== 2 || args.some((arg) => !arg)) {
  console.error("Usage: node scripts/compare-staging-baseline.mjs EXPECTED.json OBSERVED.json");
  process.exitCode = 1;
} else {
  try {
    const [a, b] = args.map((file) => JSON.parse(readFileSync(file, "utf8")));
    for (const value of [a, b]) {
      if (
        !value ||
        typeof value !== "object" ||
        required.some((key) => !Object.hasOwn(value, key) || !Array.isArray(value[key])) ||
        Object.keys(value).length !== required.length
      ) {
        throw new Error("Invalid snapshot");
      }
    }

    // Prepare the entire result before printing: malformed inputs cannot emit a partial pass.
    const results = [...required].sort().map((key) => ({
      key,
      equal: JSON.stringify(canonicalize(a[key])) === JSON.stringify(canonicalize(b[key])),
    }));
    for (const { key, equal } of results) {
      console.log(`${key}: ${equal ? "MATCH" : "DIFFERENCE"}`);
    }
    process.exitCode = results.every(({ equal }) => equal) ? 0 : 1;
  } catch {
    // JSON and filesystem errors can contain raw input or private paths. Keep diagnostics fixed.
    console.error("Baseline comparison failed: invalid, incomplete, or unreadable snapshot.");
    process.exitCode = 1;
  }
}
