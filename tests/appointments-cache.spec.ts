import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { patientAppointmentsQueryKey } from "../src/lib/supabase/query-keys";

const appointmentsSource = readFileSync(
  resolve(process.cwd(), "src/lib/supabase/appointments.ts"),
  "utf8",
);

test("patient appointments query and booking cache write share the same key helper", () => {
  expect(patientAppointmentsQueryKey("auth-user-1", "patient-1")).toEqual([
    "appointments",
    "patient",
    "auth-user-1",
    "patient-1",
  ]);

  expect(appointmentsSource).toContain(
    "queryKey: patientAppointmentsQueryKey(user?.id, patientId)",
  );

  expect(appointmentsSource).toContain(
    "patientAppointmentsQueryKey(user?.id, appointment.patientId)",
  );
});
