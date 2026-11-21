import assert from "node:assert/strict";
import { test } from "node:test";
import { isAgendaView } from "../src/lib/clinic-agenda-view";
import { appointmentActions, clinicAgenda } from "../src/lib/clinic-workspace";
import type { Appointment } from "../src/lib/types";

const now = new Date("2026-11-15T19:00:00Z"); // 00:30 on 16 November in Chennai.
const row = (id: string, changes: Partial<Appointment> = {}): Appointment => ({
  id,
  clinicId: "clinic",
  doctorId: "doctor",
  patientId: "patient",
  patientName: "",
  patientPhone: "",
  date: "2026-11-16",
  time: "10:00",
  reason: "",
  status: "pending",
  fee: 0,
  createdAt: "",
  ...changes,
});

test("agenda scopes by clinic, Chennai date and doctor before sorting", () => {
  const records = [
    row("late"),
    row("early", { time: "09:00" }),
    row("prior", { date: "2026-11-15" }),
    row("other-clinic", { clinicId: "other" }),
    row("other-doctor", { doctorId: "other" }),
    row("cancelled", { status: "cancelled" }),
  ];
  assert.deepEqual(
    clinicAgenda(
      records,
      "clinic",
      { view: "today", doctorId: "doctor", status: "pending" },
      now,
    ).map((item) => item.id),
    ["early", "late"],
  );
  assert.deepEqual(
    clinicAgenda(records, "clinic", { view: "history" }, now).map((item) => item.id),
    ["cancelled", "prior"],
  );
  assert.deepEqual(
    clinicAgenda(records, "clinic", { view: "upcoming", date: "2026-11-16" }, now).map(
      (item) => item.id,
    ),
    ["early", "late", "other-doctor"],
  );
});

test("agenda URL validation rejects non-supported views and terminal rows have no transitions", () => {
  assert.equal(isAgendaView("today"), true);
  assert.equal(isAgendaView(["today"]), false);
  assert.equal(isAgendaView("unrecognized"), false);
  assert.deepEqual(appointmentActions.completed, []);
  assert.deepEqual(appointmentActions.cancelled, []);
});
