import assert from "node:assert/strict";
import test from "node:test";
import { logAppError } from "../src/lib/error-logging";

test("app error logs exclude production exception details", (t) => {
  const write = t.mock.method(console, "error", () => {});
  const cause = new Error("synthetic private request details");
  const error = new Error("synthetic private response details", { cause });

  logAppError("Request failed", error);
  logAppError("SSR request failed", { body: "synthetic private body" });
  logAppError("Route rendering failed", error, false);

  assert.deepEqual(
    write.mock.calls.map((call) => call.arguments),
    [
      ["[CareConnect] Request failed"],
      ["[CareConnect] SSR request failed"],
      ["[CareConnect] Route rendering failed"],
    ],
  );
});

test("explicit development logging can include the original error", (t) => {
  const write = t.mock.method(console, "error", () => {});
  const error = new Error("synthetic development exception");

  logAppError("SSR request failed", error, true);

  assert.deepEqual(write.mock.calls[0]?.arguments, ["[CareConnect] SSR request failed", error]);
});
