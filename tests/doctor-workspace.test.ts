import assert from "node:assert/strict";
import test from "node:test";
import { doctorAgenda } from "../src/lib/doctor-workspace";
import type { DoctorAppointment } from "../src/lib/supabase/doctor";

function appointment(
  id: string,
  date: string,
  time: string,
  status: DoctorAppointment["status"] = "confirmed",
): DoctorAppointment {
  return {
    id,
    date,
    time,
    status,
    clinicId: "clinic",
    clinicName: "Fixture clinic",
    reason: "",
    patientName: "",
  };
}

test("uses Chennai's calendar day at the UTC date boundary and retains all today's statuses", () => {
  const rows = [
    appointment("tomorrow", "2026-11-20", "09:00"),
    appointment("cancelled", "2026-11-19", "17:00", "cancelled"),
    appointment("upcoming", "2026-11-19", "09:00"),
    appointment("elapsed", "2026-11-19", "00:01"),
    appointment("completed", "2026-11-19", "00:02", "completed"),
    appointment("yesterday", "2026-11-18", "23:30"),
  ];
  const agenda = doctorAgenda(rows, new Date("2026-11-18T18:45:00Z"));
  const ids = (items: DoctorAppointment[]) => items.map((item) => item.id);
  assert.equal(agenda.today, "2026-11-19");
  assert.deepEqual(ids(agenda.todayItems), ["elapsed", "completed", "upcoming", "cancelled"]);
  assert.deepEqual(ids(agenda.todayQueue), ["upcoming"]);
  assert.deepEqual(ids(agenda.upcoming), ["upcoming", "tomorrow"]);
  assert.deepEqual(ids(agenda.history), ["cancelled", "completed", "elapsed", "yesterday"]);
  assert.equal(rows[0]?.id, "tomorrow");
});
