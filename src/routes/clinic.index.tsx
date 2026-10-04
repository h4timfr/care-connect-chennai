import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, CalendarDays, Stethoscope, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ErrorState, PageLoader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { inr, isoDate, shortDate, to12h } from "@/lib/format";
import { describeStatusError } from "@/lib/supabase/appointments";
import type { AppointmentStatus } from "@/lib/types";

export const Route = createFileRoute("/clinic/")({
  component: ClinicDashboard,
});

const NEEDS_ACTION_LIMIT = 5;

function ClinicDashboard() {
  const { activeClinic, clinicAppointmentsStatus: status } = useApp();
  const today = isoDate(new Date());

  let body;
  if (!activeClinic) {
    body = null;
  } else if (status.isLoading) {
    body = <PageLoader label="Loading dashboard…" />;
  } else if (status.error) {
    body = (
      <ErrorState
        title="We couldn't load today's appointments"
        message={describeStatusError(status.error)}
        onRetry={status.refetch}
      />
    );
  } else {
    body = <Dashboard clinicId={activeClinic.id} today={today} />;
  }

  return (
    <ClinicShell title="Dashboard" description={`Overview for ${shortDate(today)}`}>
      {body}
    </ClinicShell>
  );
}

function Dashboard({ clinicId, today }: { clinicId: string; today: string }) {
  const { clinicAppointments, doctorsOfClinic, doctorById, setAppointmentStatus } = useApp();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const appointments = clinicAppointments.filter((a) => a.clinicId === clinicId);
  const todays = appointments
    .filter((a) => a.date === today && a.status !== "cancelled")
    .sort((a, b) => a.time.localeCompare(b.time));
  const pending = appointments
    .filter((a) => a.status === "pending")
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const expectedFees = todays
    .filter((a) => a.status !== "pending")
    .reduce((sum, a) => sum + a.fee, 0);

  const update = async (id: string, next: AppointmentStatus) => {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      await setAppointmentStatus(id, next);
      toast.success(next === "confirmed" ? "Appointment confirmed" : "Appointment declined");
    } catch (err) {
      toast.error(describeStatusError(err));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today's visits" value={String(todays.length)} icon={CalendarDays} />
        <Stat label="Awaiting confirmation" value={String(pending.length)} icon={Users} />
        <Stat label="Fees for today's confirmed visits" value={inr(expectedFees)} icon={Banknote} />
        <Stat
          label="Doctors at this clinic"
          value={String(doctorsOfClinic(clinicId).length)}
          icon={Stethoscope}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2" aria-labelledby="schedule-heading">
          <h2 id="schedule-heading" className="font-display text-lg font-semibold">
            Today's schedule
          </h2>
          <div className="surface-card divide-y">
            {todays.length ? (
              todays.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="w-16 shrink-0 font-medium">{to12h(a.time)}</div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.patientName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[doctorById(a.doctorId)?.name, a.reason].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))
            ) : (
              <p className="p-8 text-center text-muted-foreground">
                No appointments scheduled for today.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="font-display text-lg font-semibold">
            Awaiting confirmation
          </h2>
          <div className="surface-card space-y-4 p-4">
            {pending.slice(0, NEEDS_ACTION_LIMIT).map((a) => (
              <div key={a.id} className="border-b pb-3 last:border-0 last:pb-0">
                <p className="text-sm font-medium">{a.patientName}</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  {shortDate(a.date)} at {to12h(a.time)} IST
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    disabled={updatingId !== null}
                    onClick={() => update(a.id, "confirmed")}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 text-xs text-destructive"
                    disabled={updatingId !== null}
                    onClick={() => update(a.id, "cancelled")}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
            {pending.length > NEEDS_ACTION_LIMIT ? (
              <Link to="/clinic/appointments" className="block text-sm font-medium text-primary">
                View all {pending.length} requests
              </Link>
            ) : null}
            {pending.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No requests waiting.</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="surface-card p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
