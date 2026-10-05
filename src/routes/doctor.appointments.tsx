import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { EmptyState, ErrorState, InfoNotice, PageLoader, StatusBadge } from "@/components/common";
import { isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useDoctorAppointments, type DoctorAppointment } from "@/lib/supabase/doctor";
import { describeDataError, isNotDeployed } from "@/lib/supabase/errors";

export const Route = createFileRoute("/doctor/appointments")({
  head: () => ({ meta: [{ title: "Appointments — CareConnect Doctor Portal" }] }),
  component: DoctorAppointmentsPage,
});

function DoctorAppointmentsPage() {
  const { t } = useI18n();
  return (
    <DoctorShell
      title={t("doctorAppointments.title")}
      description={t("doctorAppointments.subtitle")}
    >
      {() => <AppointmentsList />}
    </DoctorShell>
  );
}

function AppointmentsList() {
  const { t } = useI18n();
  // doctor_appointments() returns only this doctor's appointments, with the patient's name only.
  const appointments = useDoctorAppointments(true);

  if (appointments.isLoading) return <PageLoader label={t("common.loading")} />;
  if (appointments.error) {
    return isNotDeployed(appointments.error) ? (
      <InfoNotice>{t("doctorPortal.notDeployed")}</InfoNotice>
    ) : (
      <ErrorState
        title={t("doctorAppointments.loadError")}
        message={t(describeDataError(appointments.error))}
        onRetry={() => void appointments.refetch()}
      />
    );
  }
  const today = isoDate(new Date());
  const all = appointments.data ?? [];
  const upcoming = all
    .filter((a) => a.date >= today && a.status !== "cancelled" && a.status !== "completed")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = all.filter((a) => !upcoming.includes(a));

  return (
    <div className="space-y-8">
      <InfoNotice className="text-sm">{t("doctorAppointments.readOnly")}</InfoNotice>
      <Section
        title={t("doctorAppointments.upcoming")}
        items={upcoming}
        empty={t("doctorAppointments.noneUpcoming")}
      />
      <Section
        title={t("doctorAppointments.past")}
        items={past}
        empty={t("doctorAppointments.nonePast")}
      />
    </div>
  );
}

function Section({
  title,
  items,
  empty,
}: {
  title: string;
  items: DoctorAppointment[];
  empty: string;
}) {
  const { t, fmt } = useI18n();
  return (
    <section aria-label={title}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {items.length === 0 ? (
        <EmptyState icon={CalendarDays} title={empty} />
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium [overflow-wrap:anywhere]" dir="auto">
                    {a.patientName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {fmt.longDate(a.date)} · {fmt.time(a.time)} ·{" "}
                    <span dir="auto">{a.clinicName}</span>
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              {a.reason ? (
                <p className="mt-2 text-sm" dir="auto">
                  <span className="text-muted-foreground">{t("doctorAppointments.reason")}: </span>
                  {a.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
