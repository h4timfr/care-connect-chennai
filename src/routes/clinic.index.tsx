import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, CalendarDays, Stethoscope, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ErrorState, PageLoader, StatusBadge } from "@/components/common";
import { CatalogNotice } from "@/components/CatalogNotice";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { describeStatusError } from "@/lib/supabase/appointments";
import type { AppointmentStatus } from "@/lib/types";

export const Route = createFileRoute("/clinic/")({
  component: ClinicDashboard,
});

const NEEDS_ACTION_LIMIT = 5;

function ClinicDashboard() {
  const { activeClinic, clinicAppointmentsStatus: status } = useApp();
  const today = isoDate(new Date());
  const { t, fmt } = useI18n();

  let body;
  if (!activeClinic) {
    body = null;
  } else if (status.isLoading) {
    body = <PageLoader label={t("clinicDashboard.loading")} />;
  } else if (status.error) {
    body = (
      <ErrorState
        title={t("clinicDashboard.loadError")}
        message={t(describeStatusError(status.error))}
        onRetry={status.refetch}
      />
    );
  } else {
    body = <Dashboard clinicId={activeClinic.id} today={today} />;
  }

  return (
    <ClinicShell
      title={t("clinicDashboard.title")}
      description={t("clinicDashboard.overview", { date: fmt.shortDate(today) })}
    >
      {body}
    </ClinicShell>
  );
}

function Dashboard({ clinicId, today }: { clinicId: string; today: string }) {
  const { clinicAppointments, doctorsOfClinic, doctorById, setAppointmentStatus, catalog } =
    useApp();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { t, fmt } = useI18n();

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
      toast.success(
        t(
          next === "confirmed"
            ? "clinicAppointments.done.confirmed"
            : "clinicAppointments.done.declined",
        ),
      );
    } catch (err) {
      toast.error(t(describeStatusError(err)));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <CatalogNotice />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label={t("clinicDashboard.todaysVisits")}
          value={fmt.number(todays.length)}
          icon={CalendarDays}
        />
        <Stat
          label={t("clinicDashboard.awaiting")}
          value={fmt.number(pending.length)}
          icon={Users}
        />
        <Stat label={t("clinicDashboard.fees")} value={fmt.inr(expectedFees)} icon={Banknote} />
        <Stat
          label={t("clinicDashboard.doctors")}
          value={catalog.error ? "—" : fmt.number(doctorsOfClinic(clinicId).length)}
          icon={Stethoscope}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 space-y-4 lg:col-span-2" aria-labelledby="schedule-heading">
          <h2
            id="schedule-heading"
            className="font-display text-lg font-semibold [overflow-wrap:anywhere]"
          >
            {t("clinicDashboard.schedule")}
          </h2>
          <div className="surface-card divide-y">
            {todays.length ? (
              todays.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="w-20 shrink-0 font-medium">{fmt.time(a.time)}</div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {a.patientName || t("common.unknownPatient")}
                      </p>
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
                {t("clinicDashboard.noneToday")}
              </p>
            )}
          </div>
        </section>

        <section className="min-w-0 space-y-4" aria-labelledby="pending-heading">
          <h2
            id="pending-heading"
            className="font-display text-lg font-semibold [overflow-wrap:anywhere]"
          >
            {t("clinicDashboard.awaiting")}
          </h2>
          <div className="surface-card space-y-4 p-4">
            {pending.slice(0, NEEDS_ACTION_LIMIT).map((a) => (
              <div key={a.id} className="border-b pb-3 last:border-0 last:pb-0">
                <p className="text-sm font-medium">{a.patientName || t("common.unknownPatient")}</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  {t("common.dateAtTime", { date: fmt.shortDate(a.date), time: fmt.time(a.time) })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="h-auto min-h-8 flex-1 whitespace-normal text-xs"
                    disabled={updatingId !== null}
                    onClick={() => update(a.id, "confirmed")}
                  >
                    {t("clinicAppointments.action.confirm")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-8 flex-1 whitespace-normal text-xs text-destructive"
                    disabled={updatingId !== null}
                    onClick={() => update(a.id, "cancelled")}
                  >
                    {t("clinicAppointments.action.decline")}
                  </Button>
                </div>
              </div>
            ))}
            {pending.length > NEEDS_ACTION_LIMIT ? (
              <Link to="/clinic/appointments" className="block text-sm font-medium text-primary">
                {t("clinicDashboard.viewAll", { count: fmt.number(pending.length) })}
              </Link>
            ) : null}
            {pending.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("clinicDashboard.noRequests")}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="surface-card min-w-0 p-4 sm:p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]">
          {label}
        </p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
