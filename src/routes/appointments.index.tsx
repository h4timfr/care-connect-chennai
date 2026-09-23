import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarX, SearchX } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { AppointmentCard } from "@/components/AppointmentCard";
import { EmptyState, SectionHeader } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/lib/store";
import { useMemo } from "react";
import { isoDate } from "@/lib/format";

import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export const Route = createFileRoute("/appointments/")({
  component: AppointmentsList,
});

function AppointmentsList() {
  const { patientAppointments: appointments, patient, isLoadingPatient } = useApp();
  const { loading, user } = useProtectedRoute("/appointments");

  const myAppointments = useMemo(
    () => appointments.filter((a) => a.patientId === patient?.id),
    [appointments, patient?.id],
  );

  const upcoming = useMemo(() => {
    const today = isoDate(new Date());
    return myAppointments
      .filter((a) => (a.status === "confirmed" || a.status === "pending") && a.date >= today)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [myAppointments]);

  const past = useMemo(() => {
    const today = isoDate(new Date());
    return myAppointments
      .filter((a) => a.status === "completed" || (a.status !== "cancelled" && a.date < today))
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  }, [myAppointments]);

  const cancelled = useMemo(() => {
    return myAppointments
      .filter((a) => a.status === "cancelled")
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  }, [myAppointments]);

  if (loading || isLoadingPatient) {
    return <PatientShell><div className="p-8">Loading...</div></PatientShell>;
  }

  if (!user || !patient) return null;

  return (
    <PatientShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">My Appointments</h1>
          <p className="text-sm text-muted-foreground">
            Manage your upcoming visits and view past consultations.
          </p>
        </div>

        <Tabs defaultValue="upcoming" className="mt-4">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {upcoming.length > 0 ? (
              <div className="space-y-4">
                {upcoming.map((a) => (
                  <AppointmentCard key={a.id} appointment={a} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarX}
                title="No upcoming appointments"
                description="You don't have any appointments scheduled."
                action={
                  <Link to="/" className="text-primary hover:underline font-medium text-sm">
                    Find a doctor
                  </Link>
                }
              />
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            {past.length > 0 ? (
              <div className="space-y-4">
                {past.map((a) => (
                  <AppointmentCard key={a.id} appointment={a} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={SearchX}
                title="No past appointments"
                description="You haven't completed any appointments yet."
              />
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="mt-4">
            {cancelled.length > 0 ? (
              <div className="space-y-4">
                {cancelled.map((a) => (
                  <AppointmentCard key={a.id} appointment={a} />
                ))}
              </div>
            ) : (
              <EmptyState icon={SearchX} title="No cancelled appointments" description="" />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PatientShell>
  );
}


