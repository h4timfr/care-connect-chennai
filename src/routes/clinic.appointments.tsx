import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ErrorState, PageLoader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { shortDate, to12h } from "@/lib/format";
import { describeStatusError } from "@/lib/supabase/appointments";
import { cn } from "@/lib/utils";
import type { Appointment, AppointmentStatus } from "@/lib/types";

export const Route = createFileRoute("/clinic/appointments")({
  component: ClinicAppointments,
});

type Filter = "all" | "upcoming" | "pending";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "pending", label: "Awaiting confirmation" },
];

/** Transitions the check_appointment_update trigger allows clinic staff to make. */
const ACTIONS: Partial<
  Record<AppointmentStatus, { status: AppointmentStatus; label: string; danger?: boolean }[]>
> = {
  pending: [
    { status: "confirmed", label: "Confirm" },
    { status: "cancelled", label: "Decline", danger: true },
  ],
  confirmed: [
    { status: "arrived", label: "Mark arrived" },
    { status: "cancelled", label: "Cancel", danger: true },
  ],
  arrived: [{ status: "completed", label: "Mark completed" }],
};

const SUCCESS: Record<AppointmentStatus, string> = {
  pending: "Appointment updated",
  confirmed: "Appointment confirmed",
  arrived: "Marked as arrived",
  completed: "Marked as completed",
  cancelled: "Appointment cancelled",
};

function ClinicAppointments() {
  const { clinicAppointments, clinicAppointmentsStatus: status, activeClinic } = useApp();
  const [filter, setFilter] = useState<Filter>("all");

  let body;
  if (!activeClinic) {
    body = null;
  } else if (status.isLoading) {
    body = <PageLoader label="Loading appointments…" />;
  } else if (status.error) {
    body = (
      <ErrorState
        title="We couldn't load appointments"
        message={describeStatusError(status.error)}
        onRetry={status.refetch}
      />
    );
  } else {
    const rows = clinicAppointments
      .filter((a) => a.clinicId === activeClinic.id)
      .filter((a) => {
        if (filter === "upcoming") return a.status === "confirmed" || a.status === "pending";
        if (filter === "pending") return a.status === "pending";
        return true;
      })
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter appointments">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <AppointmentTable rows={rows} />
      </div>
    );
  }

  return (
    <ClinicShell title="Appointments" description="Appointment requests and visits">
      {body}
    </ClinicShell>
  );
}

function AppointmentTable({ rows }: { rows: Appointment[] }) {
  const { setAppointmentStatus, doctorById } = useApp();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const update = async (id: string, next: AppointmentStatus) => {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      await setAppointmentStatus(id, next);
      toast.success(SUCCESS[next]);
    } catch (err) {
      toast.error(describeStatusError(err));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th scope="col" className="p-4 font-medium">
              Patient
            </th>
            <th scope="col" className="p-4 font-medium">
              Date & time (IST)
            </th>
            <th scope="col" className="p-4 font-medium">
              Doctor
            </th>
            <th scope="col" className="p-4 font-medium">
              Reason
            </th>
            <th scope="col" className="p-4 font-medium">
              Status
            </th>
            <th scope="col" className="p-4 font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((a) => (
            <tr key={a.id} className="align-top transition-colors hover:bg-muted/30">
              <td className="p-4 font-medium">{a.patientName}</td>
              <td className="whitespace-nowrap p-4">
                {shortDate(a.date)}
                <span className="block text-xs text-muted-foreground">{to12h(a.time)}</span>
              </td>
              <td className="p-4">{doctorById(a.doctorId)?.name ?? "—"}</td>
              <td className="max-w-[180px] truncate p-4" title={a.reason || undefined}>
                {a.reason || <span className="text-muted-foreground">—</span>}
              </td>
              <td className="p-4">
                <StatusBadge status={a.status} />
              </td>
              <td className="p-4">
                <div className="flex flex-wrap gap-2">
                  {(ACTIONS[a.status] ?? []).map((action) => (
                    <Button
                      key={action.status}
                      size="sm"
                      variant="outline"
                      disabled={updatingId !== null}
                      className={cn(
                        "h-8 text-xs",
                        action.danger && "text-destructive hover:bg-destructive/10",
                      )}
                      onClick={() => update(a.id, action.status)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-8 text-center text-muted-foreground">
                No appointments match this filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
