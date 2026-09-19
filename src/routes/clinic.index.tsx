import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { useApp } from "@/lib/store";
import { CalendarDays, Users, Stethoscope, Banknote } from "lucide-react";
import { StatusBadge } from "@/components/common";
import { isoDate, shortDate, to12h } from "@/lib/format";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/clinic/")({
  component: ClinicDashboard,
});

function ClinicDashboard() {
  const { appointments, activeClinic, doctors, doctorById } = useApp();
  const today = isoDate(new Date());

  const clinicAppointments = appointments.filter((a) => a.clinicId === activeClinic.id);
  const todayAppointments = clinicAppointments.filter(
    (a) => a.date === today && a.status !== "cancelled",
  );
  const pendingRequests = clinicAppointments.filter((a) => a.status === "pending");

  const estimatedRevenue = todayAppointments
    .filter((a) => a.status === "completed" || a.status === "arrived" || a.status === "confirmed")
    .reduce((sum, a) => sum + a.fee, 0);

  const activeDoctors = doctors.filter((d) => d.clinicId === activeClinic.id).length;

  return (
    <ClinicShell
      title="Dashboard"
      description={`Overview for ${shortDate(today)}`}
      actions={<Button size="sm">New Appointment</Button>}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="surface-card p-5 border-l-4 border-l-primary">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Today's Visits</p>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="font-display text-3xl font-bold">{todayAppointments.length}</p>
          </div>

          <div className="surface-card p-5 border-l-4 border-l-amber-500">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Pending Requests</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="font-display text-3xl font-bold">{pendingRequests.length}</p>
          </div>

          <div className="surface-card p-5 border-l-4 border-l-emerald-500">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Est. Revenue</p>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="font-display text-3xl font-bold">₹{estimatedRevenue}</p>
          </div>

          <div className="surface-card p-5 border-l-4 border-l-indigo-500">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Active Doctors</p>
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="font-display text-3xl font-bold">{activeDoctors}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="font-display font-semibold text-lg">Today's Schedule</h2>
            <div className="surface-card divide-y">
              {todayAppointments.length > 0 ? (
                todayAppointments
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((a) => {
                    const doctor = doctorById(a.doctorId);
                    return (
                      <div key={a.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="font-medium w-16 shrink-0">{to12h(a.time)}</div>
                          <div>
                            <p className="font-medium">{a.patientName}</p>
                            <p className="text-xs text-muted-foreground">
                              with {doctor?.name} · {a.reason}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                    );
                  })
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No appointments scheduled for today.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="font-display font-semibold text-lg">Needs Action</h2>
            <div className="surface-card p-4 space-y-4">
              {pendingRequests.slice(0, 5).map((a) => (
                <div key={a.id} className="border-b last:border-0 pb-3 last:pb-0">
                  <p className="font-medium text-sm">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {shortDate(a.date)} at {to12h(a.time)}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-7 text-xs">
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs text-destructive"
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
              {pendingRequests.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No pending requests.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </ClinicShell>
  );
}
