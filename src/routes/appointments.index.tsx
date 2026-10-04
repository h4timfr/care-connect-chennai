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
    body = <PageLoader label="Loading appointments…" />;
  } else if (patientError || status.error) {
    body = (
      <ErrorState
        title="We couldn't load your appointments"
        message={describeDataError(patientError ?? status.error)}
        onRetry={status.refetch}
      />
    );
  } else if (!patient) {
    body = <MissingProfile action="have appointments" />;
  } else {
    body = (
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled ({cancelled.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <AppointmentList
            items={upcoming}
            empty={
              <EmptyState
                icon={CalendarX}
                title="No upcoming appointments"
                description="When you book an appointment it will appear here."
                action={
                  <Button asChild size="sm">
                    <Link to="/discover">Find a doctor</Link>
                  </Button>
                }
              />
            }
          />
        </TabsContent>
        <TabsContent value="past" className="mt-4">
          <AppointmentList
            items={past}
            empty={<EmptyState icon={SearchX} title="No past appointments" />}
          />
        </TabsContent>
        <TabsContent value="cancelled" className="mt-4">
          <AppointmentList
            items={cancelled}
            empty={<EmptyState icon={SearchX} title="No cancelled appointments" />}
          />
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <PatientShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">My appointments</h1>
          <p className="text-sm text-muted-foreground">
            Your upcoming visits and appointment history.
          </p>
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
