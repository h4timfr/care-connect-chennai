import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarX, SearchX } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { PatientShell } from "@/components/layout/PatientShell";
import { AppointmentCard } from "@/components/AppointmentCard";
import { EmptyState, ErrorState, PageLoader } from "@/components/common";
import { MissingProfile } from "@/components/MissingProfile";
import { CatalogNotice } from "@/components/CatalogNotice";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/lib/store";
import { isoDate } from "@/lib/format";
import { describeDataError } from "@/lib/supabase/errors";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { useI18n } from "@/lib/i18n";
import type { Appointment } from "@/lib/types";

export const Route = createFileRoute("/appointments/")({
  head: () => ({ meta: [{ title: "Your appointments — CareConnect" }] }),
  component: AppointmentsList,
});

const byDateAsc = (a: Appointment, b: Appointment) =>
  `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
const byDateDesc = (a: Appointment, b: Appointment) => byDateAsc(b, a);

function AppointmentsList() {
  const {
    patientAppointments,
    patientAppointmentsStatus: status,
    patient,
    isLoadingPatient,
    patientError,
  } = useApp();
  const { loading, user } = useProtectedRoute();
  const { t } = useI18n();

  const { upcoming, past, cancelled } = useMemo(() => {
    const today = isoDate(new Date());
    return {
      upcoming: patientAppointments
        .filter((a) => (a.status === "confirmed" || a.status === "pending") && a.date >= today)
        .sort(byDateAsc),
      past: patientAppointments
        .filter(
          (a) =>
            a.status === "completed" ||
            a.status === "arrived" ||
            (a.status !== "cancelled" && a.date < today),
        )
        .sort(byDateDesc),
      cancelled: patientAppointments.filter((a) => a.status === "cancelled").sort(byDateDesc),
    };
  }, [patientAppointments]);

  let body;
  if (loading || !user || isLoadingPatient || status.isLoading) {
    body = <PageLoader label={t("appointments.loading")} />;
  } else if (patientError || status.error) {
    body = (
      <ErrorState
        title={t("appointments.loadError")}
        message={t(describeDataError(patientError ?? status.error))}
        onRetry={status.refetch}
      />
    );
  } else if (!patient) {
    body = <MissingProfile action="appointments" />;
  } else {
    body = (
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            {t("appointments.upcoming", { count: upcoming.length })}
          </TabsTrigger>
          <TabsTrigger value="past">{t("appointments.past", { count: past.length })}</TabsTrigger>
          <TabsTrigger value="cancelled">
            {t("appointments.cancelledTab", { count: cancelled.length })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <AppointmentList
            items={upcoming}
            empty={
              <EmptyState
                icon={CalendarX}
                title={t("appointments.noUpcomingTitle")}
                description={t("appointments.noUpcomingBody")}
                action={
                  <Button asChild size="sm">
                    <Link to="/discover">{t("common.findADoctor")}</Link>
                  </Button>
                }
              />
            }
          />
        </TabsContent>
        <TabsContent value="past" className="mt-4">
          <AppointmentList
            items={past}
            empty={<EmptyState icon={SearchX} title={t("appointments.noPast")} />}
          />
        </TabsContent>
        <TabsContent value="cancelled" className="mt-4">
          <AppointmentList
            items={cancelled}
            empty={<EmptyState icon={SearchX} title={t("appointments.noCancelled")} />}
          />
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <PatientShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("appointments.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("appointments.subtitle")}</p>
        </div>
        <CatalogNotice />
        {body}
      </div>
    </PatientShell>
  );
}

function AppointmentList({ items, empty }: { items: Appointment[]; empty: ReactNode }) {
  if (!items.length) return <>{empty}</>;
  return (
    <ul className="space-y-4">
      {items.map((a) => (
        <li key={a.id}>
          <AppointmentCard appointment={a} />
        </li>
      ))}
    </ul>
  );
}
