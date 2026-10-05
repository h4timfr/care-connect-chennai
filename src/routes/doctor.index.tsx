import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { EmptyState, InfoNotice, StatusBadge } from "@/components/common";
import { VerificationPill } from "@/components/ProviderStatus";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useDoctorAppointments, type MyDoctor } from "@/lib/supabase/doctor";
import { describeDataError, isNotDeployed } from "@/lib/supabase/errors";
import { isoDate } from "@/lib/format";

export const Route = createFileRoute("/doctor/")({
  head: () => ({ meta: [{ title: "Doctor Portal — CareConnect" }] }),
  component: DoctorDashboard,
});

function DoctorDashboard() {
  const { t } = useI18n();
  return (
    <DoctorShell title={t("doctorDashboard.title")} description={t("doctorDashboard.subtitle")}>
      {(me) => <Dashboard me={me} />}
    </DoctorShell>
  );
}

function Dashboard({ me }: { me: MyDoctor }) {
  const { t, fmt } = useI18n();
  const verified = me.links.some((l) => l.verified && l.active);
  const appointments = useDoctorAppointments(true);
  const today = isoDate(new Date());
  const upcoming = (appointments.data ?? [])
    .filter((a) => a.date >= today && a.status !== "cancelled" && a.status !== "completed")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {!verified ? (
        <InfoNotice className="text-sm">{t("doctorDashboard.pendingNote")}</InfoNotice>
      ) : null}

      <section aria-labelledby="doctor-clinics" className="surface-card p-5">
        <h2 id="doctor-clinics" className="font-semibold">
          {t("doctorDashboard.clinics")}
        </h2>
        {me.links.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("doctorDashboard.noClinics")}</p>
        ) : (
          <ul className="mt-3 divide-y">
            {me.links.map((l) => (
              <li
                key={l.clinicId}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]" dir="auto">
                  {l.clinicName}
                </span>
                <VerificationPill state={l.verified ? "verified" : "pending"} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="doctor-upcoming">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="doctor-upcoming" className="font-semibold">
            {t("doctorDashboard.upcoming")}
          </h2>
          <Button asChild variant="outline" size="sm">
            <Link to="/doctor/appointments">{t("common.seeAll")}</Link>
          </Button>
        </div>
        {appointments.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : appointments.error ? (
          <InfoNotice className="text-sm">
            {isNotDeployed(appointments.error)
              ? t("doctorPortal.notDeployed")
              : t(describeDataError(appointments.error))}
          </InfoNotice>
        ) : upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title={t("doctorAppointments.noneUpcoming")} />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <li
                key={a.id}
                className="surface-card flex flex-wrap items-center justify-between gap-2 p-4"
              >
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
