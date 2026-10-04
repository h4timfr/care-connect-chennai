import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ErrorState, PageLoader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { describeStatusError } from "@/lib/supabase/appointments";
import { cn } from "@/lib/utils";
import type { Appointment, AppointmentStatus } from "@/lib/types";

export const Route = createFileRoute("/clinic/appointments")({
  component: ClinicAppointments,
});

type Filter = "all" | "upcoming" | "pending";

const FILTERS: { value: Filter; label: MessageKey }[] = [
  { value: "all", label: "clinicAppointments.filter.all" },
  { value: "upcoming", label: "clinicAppointments.filter.upcoming" },
  { value: "pending", label: "clinicAppointments.filter.pending" },
];

/** Transitions the check_appointment_update trigger allows clinic staff to make. */
const ACTIONS: Partial<
  Record<
    AppointmentStatus,
    { status: AppointmentStatus; label: MessageKey; done: MessageKey; danger?: boolean }[]
  >
> = {
  pending: [
    {
      status: "confirmed",
      label: "clinicAppointments.action.confirm",
      done: "clinicAppointments.done.confirmed",
    },
    {
      status: "cancelled",
      label: "clinicAppointments.action.decline",
      done: "clinicAppointments.done.declined",
      danger: true,
    },
  ],
  confirmed: [
    {
      status: "arrived",
      label: "clinicAppointments.action.arrived",
      done: "clinicAppointments.done.arrived",
    },
    {
      status: "cancelled",
      label: "clinicAppointments.action.cancel",
      done: "clinicAppointments.done.cancelled",
      danger: true,
    },
  ],
  arrived: [
    {
      status: "completed",
      label: "clinicAppointments.action.completed",
      done: "clinicAppointments.done.completed",
    },
  ],
};

function ClinicAppointments() {
  const { clinicAppointments, clinicAppointmentsStatus: status, activeClinic } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const { t } = useI18n();

  let body;
  if (!activeClinic) {
    body = null;
  } else if (status.isLoading) {
    body = <PageLoader label={t("clinicAppointments.loading")} />;
  } else if (status.error) {
    body = (
      <ErrorState
        title={t("clinicAppointments.loadError")}
        message={t(describeStatusError(status.error))}
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
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t("clinicAppointments.filterLabel")}
        >
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {t(f.label)}
            </Button>
          ))}
        </div>
        <AppointmentTable rows={rows} />
      </div>
    );
  }

  return (
    <ClinicShell
      title={t("clinicAppointments.title")}
      description={t("clinicAppointments.subtitle")}
    >
      {body}
    </ClinicShell>
  );
}

function AppointmentTable({ rows }: { rows: Appointment[] }) {
  const { setAppointmentStatus, doctorById } = useApp();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { t, fmt } = useI18n();

  const update = async (id: string, next: AppointmentStatus, done: MessageKey) => {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      await setAppointmentStatus(id, next);
      toast.success(t(done));
    } catch (err) {
      toast.error(t(describeStatusError(err)));
    } finally {
      setUpdatingId(null);
    }
  };

  const actionsFor = (a: Appointment) => (
    <div className="flex flex-wrap gap-2">
      {(ACTIONS[a.status] ?? []).map((action) => (
        <Button
          key={action.status}
          size="sm"
          variant="outline"
          disabled={updatingId !== null}
          className={cn("h-8 text-xs", action.danger && "text-destructive hover:bg-destructive/10")}
          onClick={() => update(a.id, action.status, action.done)}
        >
          {t(action.label)}
        </Button>
      ))}
    </div>
  );

  if (rows.length === 0) {
    return (
      <p className="surface-card p-8 text-center text-muted-foreground">
        {t("clinicAppointments.none")}
      </p>
    );
  }

  return (
    <>
      {/* Phones: one card per appointment so status and actions stay visible. */}
      <ul className="space-y-3 md:hidden">
        {rows.map((a) => (
          <li key={a.id} className="surface-card space-y-3 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {a.patientName || t("common.unknownPatient")}
                </p>
                <p className="text-muted-foreground">
                  {fmt.shortDate(a.date)} · {fmt.timeIst(a.time)}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </div>
            <p className="text-muted-foreground">
              {[doctorById(a.doctorId)?.name, a.reason].filter(Boolean).join(" · ")}
            </p>
            {actionsFor(a)}
          </li>
        ))}
      </ul>

      <div className="surface-card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-start text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th scope="col" className="p-4 text-start font-medium">
                {t("clinicAppointments.col.patient")}
              </th>
              <th scope="col" className="p-4 text-start font-medium">
                {t("clinicAppointments.col.dateTime")}
              </th>
              <th scope="col" className="p-4 text-start font-medium">
                {t("clinicAppointments.col.doctor")}
              </th>
              <th scope="col" className="p-4 text-start font-medium">
                {t("clinicAppointments.col.reason")}
              </th>
              <th scope="col" className="p-4 text-start font-medium">
                {t("clinicAppointments.col.status")}
              </th>
              <th scope="col" className="p-4 text-start font-medium">
                {t("clinicAppointments.col.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((a) => (
              <tr key={a.id} className="align-top transition-colors hover:bg-muted/30">
                <td className="p-4 font-medium">{a.patientName || t("common.unknownPatient")}</td>
                <td className="whitespace-nowrap p-4">
                  {fmt.shortDate(a.date)}
                  <span className="block text-xs text-muted-foreground">{fmt.time(a.time)}</span>
                </td>
                <td className="p-4">{doctorById(a.doctorId)?.name ?? "—"}</td>
                <td className="max-w-[180px] truncate p-4" title={a.reason || undefined}>
                  {a.reason || <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-4">
                  <StatusBadge status={a.status} />
                </td>
                <td className="p-4">{actionsFor(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
