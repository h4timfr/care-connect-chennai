import assert from "node:assert/strict";
import test from "node:test";
import { isAppointmentInPast } from "../src/lib/appointment-time";

test("compares appointment date and time in India local time", () => {
  const now = new Date("2026-10-18T05:00:00.000Z"); // 10:30:00 in Asia/Kolkata
  assert.equal(isAppointmentInPast("2026-10-17", "23:59:00", now), true);
  assert.equal(isAppointmentInPast("2026-10-18", "10:29:59", now), true);
  assert.equal(isAppointmentInPast("2026-10-18", "10:30:00", now), true);
  assert.equal(isAppointmentInPast("2026-10-18", "10:31:00", now), false);
  assert.equal(isAppointmentInPast("2026-10-19", "00:00:00", now), false);
});

test("normalizes PostgreSQL times without seconds", () => {
  const now = new Date("2026-10-18T05:00:00.000Z");
  assert.equal(isAppointmentInPast("2026-10-18", "10:29", now), true);
  assert.equal(isAppointmentInPast("2026-10-18", "10:31", now), false);
});
