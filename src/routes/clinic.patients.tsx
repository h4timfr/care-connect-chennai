import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ErrorState, Initials, PageLoader } from "@/components/common";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { isoDate, shortDate } from "@/lib/format";
import { describeStatusError } from "@/lib/supabase/appointments";
import type { Appointment } from "@/lib/types";

export const Route = createFileRoute("/clinic/patients")({
  component: ClinicPatients,
});

interface PatientSummary {
  id: string;
  name: string;
  appointments: Appointment[];
}

function ClinicPatients() {
  const { activeClinic, clinicAppointmentsStatus: status } = useApp();

  let body;
  if (!activeClinic) {
    body = null;
  } else if (status.isLoading) {
    body = <PageLoader label="Loading patients…" />;
  } else if (status.error) {
    body = (
      <ErrorState
        title="We couldn't load patients"
        message={describeStatusError(status.error)}
        onRetry={status.refetch}
      />
    );
  } else {
    body = <PatientList clinicId={activeClinic.id} />;
  }

  return (
    <ClinicShell title="Patients" description="Patients who have booked with your clinic">
      {body}
    </ClinicShell>
  );
}

function PatientList({ clinicId }: { clinicId: string }) {
  const { clinicAppointments } = useApp();
  const [search, setSearch] = useState("");

  const patients = useMemo(() => {
    const byId = new Map<string, PatientSummary>();
    for (const a of clinicAppointments) {
      if (a.clinicId !== clinicId) continue;
      const entry = byId.get(a.patientId) ?? {
        id: a.patientId,
        name: a.patientName,
        appointments: [],
      };
      entry.appointments.push(a);
      byId.set(a.patientId, entry);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [clinicAppointments, clinicId]);

  const today = isoDate(new Date());
  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? patients.filter((p) => p.name.toLowerCase().includes(needle))
    : patients;

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <label htmlFor="patient-search" className="sr-only">
          Search patients by name
        </label>
        <Input
          id="patient-search"
          type="search"
          placeholder="Search patients by name…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th scope="col" className="p-4 font-medium">
                Patient
              </th>
              <th scope="col" className="p-4 font-medium">
                Appointments
              </th>
              <th scope="col" className="p-4 font-medium">
                Last completed visit
              </th>
              <th scope="col" className="p-4 font-medium">
                Next appointment
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((p) => {
              const visits = p.appointments.filter(
                (a) => a.status === "completed" || a.status === "arrived",
              );
              const lastVisit = visits
                .map((a) => a.date)
                .sort()
                .at(-1);
              const next = p.appointments
                .filter(
                  (a) => (a.status === "pending" || a.status === "confirmed") && a.date >= today,
                )
                .map((a) => a.date)
                .sort()[0];
              return (
                <tr key={p.id} className="transition-colors hover:bg-muted/30">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Initials name={p.name} className="h-10 w-10 text-xs" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="p-4">{p.appointments.length}</td>
                  <td className="p-4">{lastVisit ? shortDate(lastVisit) : "—"}</td>
                  <td className="p-4">{next ? shortDate(next) : "—"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  {patients.length === 0
                    ? "No patients have booked appointments yet."
                    : "No patients match that name."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
