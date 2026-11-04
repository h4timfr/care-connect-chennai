import assert from "node:assert/strict";
import { test } from "node:test";
import { connectToastHandler, toast } from "../src/lib/toast";

test("toast requests keep their type, message, and options for the deferred host", () => {
  const received: unknown[] = [];
  const disconnect = connectToastHandler((request) => received.push(request));
  const options = { duration: 2500 };

  toast.success("Saved", options);
  toast.error("Could not save");

  assert.deepEqual(received, [
    { kind: "success", message: "Saved", options },
    { kind: "error", message: "Could not save" },
  ]);
  disconnect();
});

test("an old deferred host cannot disconnect a newer mounted host", () => {
  const first: string[] = [];
  const second: string[] = [];
  const disconnectFirst = connectToastHandler(({ message }) => first.push(message));
  connectToastHandler(({ message }) => second.push(message));

  disconnectFirst();
  toast.error("Still connected");

  assert.deepEqual(first, []);
  assert.deepEqual(second, ["Still connected"]);
});
