import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./compare-staging-baseline.mjs", import.meta.url));
const categories = [
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
const snapshot = () => Object.fromEntries(categories.map((key) => [key, []]));
const marker = "PRIVATE_DIAGNOSTIC_MUST_NOT_APPEAR";

function fixture(run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "careconnect-baseline-comparison-"));
  const expected = path.join(dir, "expected.json");
  const observed = path.join(dir, "observed.json");
  const write = (a, b) => {
    writeFileSync(expected, JSON.stringify(a));
    writeFileSync(observed, JSON.stringify(b));
  };
  const compare = (args = [expected, observed]) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    return { status: result.status, output: result.stdout + result.stderr };
  };
  try {
    run({ dir, expected, observed, write, compare });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("matching snapshots ignore object key order and emit only fixed category labels", () => {
  fixture(({ write, compare }) => {
    const a = snapshot();
    a.tables = [{ name: "users", rls: true }];
    const b = Object.fromEntries(Object.entries(a).reverse());
    b.tables = [{ rls: true, name: "users" }];
    write(a, b);
    const result = compare();
    assert.equal(result.status, 0);
    assert.deepEqual(
      result.output.trim().split(/\r?\n/),
      [...categories].sort().map((key) => `${key}: MATCH`),
    );
  });
});

for (const category of categories) {
  test(`fails closed on ${category} drift without printing snapshot values`, () => {
    fixture(({ write, compare }) => {
      const changed = snapshot();
      changed[category].push(marker);
      write(snapshot(), changed);
      const result = compare();
      assert.equal(result.status, 1);
      assert.ok(result.output.includes(`${category}: DIFFERENCE`));
      assert.ok(!result.output.includes(marker));
    });
  });
}

for (const [label, change] of [
  [
    "missing",
    (value) => {
      delete value.policies;
    },
  ],
  [
    "null",
    (value) => {
      value.policies = null;
    },
  ],
  [
    "unexpected",
    (value) => {
      value[marker] = [];
    },
  ],
]) {
  for (const side of ["expected", "observed"]) {
    test(`rejects ${label} ${side} categories`, () => {
      fixture(({ write, compare }) => {
        const a = snapshot(),
          b = snapshot();
        change(side === "expected" ? a : b);
        write(a, b);
        const result = compare();
        assert.equal(result.status, 1);
        assert.ok(!result.output.includes(marker));
        assert.ok(!result.output.includes(": MATCH"));
      });
    });
  }
}

test("preserves array order because enum labels and column positions are semantic", () => {
  fixture(({ write, compare }) => {
    const a = snapshot(),
      b = snapshot();
    a.enums = [{ labels: ["pending", "confirmed"] }];
    b.enums = [{ labels: ["confirmed", "pending"] }];
    write(a, b);
    assert.equal(compare().status, 1);
  });
});

test("malformed JSON fails without exposing its contents or a stack trace", () => {
  fixture(({ write, compare, observed }) => {
    write(snapshot(), snapshot());
    writeFileSync(observed, `{"${marker}": broken JSON}`);
    const result = compare();
    assert.equal(result.status, 1);
    assert.ok(!result.output.includes(marker));
    assert.ok(!result.output.includes("at file:"));
  });
});

test("unreadable input fails without exposing private file paths", () => {
  fixture(({ write, compare, dir, expected }) => {
    write(snapshot(), snapshot());
    const result = compare([expected, path.join(dir, marker)]);
    assert.equal(result.status, 1);
    assert.ok(!result.output.includes(marker));
    assert.ok(!result.output.includes(dir));
  });
});

for (const args of [[], [marker], [marker, marker, marker]]) {
  test("requires exactly two snapshot paths without echoing arguments", () => {
    fixture(({ compare }) => {
      const result = compare(args);
      assert.equal(result.status, 1);
      assert.ok(!result.output.includes(marker));
      assert.ok(result.output.startsWith("Usage:"));
    });
  });
}

test("rejects an extra argument even when both snapshot paths are valid", () => {
  fixture(({ write, compare, expected, observed }) => {
    write(snapshot(), snapshot());
    const result = compare([expected, observed, marker]);
    assert.equal(result.status, 1);
    assert.ok(!result.output.includes(": MATCH"));
    assert.ok(!result.output.includes(marker));
  });
});

test("baseline comparator tests run in CI whenever comparator sources change", () => {
  const workflow = readFileSync(
    path.join(path.dirname(script), "../.github/workflows/staging-reconciliation-rehearsal.yml"),
    "utf8",
  );
  assert.match(workflow, /scripts\/compare-staging-baseline\*\.mjs/);
  assert.match(workflow, /node --test scripts\/compare-staging-baseline\.test\.mjs/);
});
