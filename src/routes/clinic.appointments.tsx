import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { useApp } from "@/lib/store";
import { useState } from "react";
import { StatusBadge } from "@/components/common";
import { shortDate, to12h } from "@/lib/format";
import { doctorById } from "@/data/mock";
import { Button } from "@/components/ui/button";
import type { AppointmentStatus } from "@/lib/types";

export const Route = createFileRoute("/clinic/appointments")({
  component: ClinicAppointments,
});

function ClinicAppointments() {
  const { appointments, activeClinic, setAppointmentStatus } = useApp();
  const [filter, setFilter] = useState<"all" | "upcoming" | "pending">("all");

  const clinicAppointments = appointments
    .filter((a) => a.clinicId === activeClinic.id)
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

  const filtered = clinicAppointments.filter((a) => {
    if (filter === "upcoming") return a.status === "confirmed" || a.status === "pending";
    if (filter === "pending") return a.status === "pending";
    return true;
  });

  const updateStatus = (id: string, status: AppointmentStatus) => {
    setAppointmentStatus(id, status);
  };

  return (
    <ClinicShell title="Appointments" description="Manage all patient appointments">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            variant={filter === "upcoming" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("upcoming")}
          >
            Upcoming
          </Button>
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("pending")}
          >
            Pending
          </Button>
        </div>

        <div className="surface-card overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[700px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="font-medium p-4">Patient</th>
                <th className="font-medium p-4">Date & Time</th>
                <th className="font-medium p-4">Doctor</th>
                <th className="font-medium p-4">Reason</th>
                <th className="font-medium p-4">Status</th>
                <th className="font-medium p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((a) => {
                const doctor = doctorById(a.doctorId);
                return (
                  <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <p className="font-medium">{a.patientName}</p>
                      <p className="text-xs text-muted-foreground">{a.patientPhone}</p>
                    </td>
                    <td className="p-4">
                      <p>{shortDate(a.date)}</p>
                      <p className="text-xs text-muted-foreground">{to12h(a.time)}</p>
                    </td>
                    <td className="p-4">{doctor?.name}</td>
                    <td className="p-4 max-w-[150px] truncate" title={a.reason}>
                      {a.reason}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="p-4">
                      {a.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => updateStatus(a.id, "confirmed")}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => updateStatus(a.id, "cancelled")}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {a.status === "confirmed" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => updateStatus(a.id, "arrived")}
                          >
                            Arrived
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => updateStatus(a.id, "cancelled")}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                      {a.status === "arrived" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => updateStatus(a.id, "completed")}
                        >
                          Complete
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No appointments found.
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
