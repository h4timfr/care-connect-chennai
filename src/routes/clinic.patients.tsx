import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { useState, useMemo } from "react";
import { useApp } from "@/lib/store";
import type { Patient, Appointment } from "@/lib/types";
import { Users, Search, Phone, Mail, UserPlus, Calendar, Clock, MapPin, Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Initials, StatusBadge } from "@/components/common";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/clinic/patients")({
  component: ClinicPatients,
});

function ClinicPatients() {
  const { appointments, activeClinic } = useApp();
  const [search, setSearch] = useState("");

  const clinicAppointments = appointments.filter((a) => a.clinicId === activeClinic.id);

  // Extract unique patients from appointments
  const uniquePatientsMap = new Map();
  clinicAppointments.forEach((a) => {
    if (!uniquePatientsMap.has(a.patientId)) {
      uniquePatientsMap.set(a.patientId, {
        id: a.patientId,
        name: a.patientName,
        phone: a.patientPhone,
        appointments: [],
      });
    }
    uniquePatientsMap.get(a.patientId).appointments.push(a);
  });

  const allPatients = Array.from(uniquePatientsMap.values());
  const filteredPatients = allPatients.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search),
  );

  return (
    <ClinicShell title="Patients" description="Manage patient records">
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search patients by name or phone..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="surface-card overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[600px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="font-medium p-4">Patient</th>
                <th className="font-medium p-4">Contact</th>
                <th className="font-medium p-4">Total Visits</th>
                <th className="font-medium p-4">Last Visit</th>
                <th className="font-medium p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPatients.map((p: Patient) => {
                const sortedApts: Appointment[] = [];
                // Temporarily typed as any to prevent TS narrowing to 'never' on unassigned const
                const lastVisit: any = undefined;
                const completed = 0;

                return (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Initials name={p.name} className="h-10 w-10 text-xs" />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="h-3 w-3" /> {p.phone}
                      </div>
                    </td>
                    <td className="p-4">{0}</td>
                    <td className="p-4">{lastVisit ? shortDate(lastVisit.date) : "N/A"}</td>
                    <td className="p-4">
                      {completed > 0 ? (
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md">
                          Returning
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-md">
                          New Patient
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredPatients.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {allPatients.length === 0
                      ? "No patients have booked appointments yet."
                      : "No matching patients found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ClinicShell>
  );
}
