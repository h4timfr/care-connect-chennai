import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Clock, MapPin, SearchX } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { CancelAppointmentButton } from "@/components/AppointmentCard";
import { isCancellable } from "@/lib/supabase/appointments";
import { MessageClinicButton } from "@/components/MessageClinicButton";
import { EmptyState, ErrorState, Initials, PageLoader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { inr, longDate, specialtyName, to12h } from "@/lib/format";
import { describeDataError } from "@/lib/supabase/errors";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export const Route = createFileRoute("/appointments/$appointmentId")({
  head: () => ({ meta: [{ title: "Appointment details — CareConnect" }] }),
  component: AppointmentDetails,
});

const STATUS_HELP: Record<string, string> = {
  pending: "Your request has been sent. The clinic will confirm it.",
  confirmed: "The clinic has confirmed this appointment.",
  arrived: "The clinic has checked you in.",
  completed: "This appointment is complete.",
  cancelled: "This appointment was cancelled.",
};

function AppointmentDetails() {
  const { appointmentId } = Route.useParams();
  const {
    patientAppointments,
    patientAppointmentsStatus: status,
    isLoadingPatient,
    doctorById,
    clinicById,
  } = useApp();
  const { loading, user } = useProtectedRoute();

  const appointment = patientAppointments.find((a) => a.id === appointmentId);

  if (loading || !user || isLoadingPatient || status.isLoading) {
    return (
      <PatientShell>
        <PageLoader label="Loading appointment…" />
      </PatientShell>
    );
  }

  if (status.error) {
    return (
      <PatientShell>
        <ErrorState
          title="We couldn't load this appointment"
          message={describeDataError(status.error)}
          onRetry={status.refetch}
        />
      </PatientShell>
    );
  }

  if (!appointment) {
    return (
      <PatientShell>
        <EmptyState
          icon={SearchX}
          title="Appointment not found"
          description="This appointment doesn't exist or isn't linked to your account."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/appointments">Back to appointments</Link>
            </Button>
          }
        />
      </PatientShell>
    );
  }

  const doctor = doctorById(appointment.doctorId);
  const clinic = clinicById(appointment.clinicId);

  return (
    <PatientShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          to="/appointments"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All appointments
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold">Appointment details</h1>
          <StatusBadge status={appointment.status} />
        </div>
        <p className="text-sm text-muted-foreground">{STATUS_HELP[appointment.status]}</p>

        <div className="surface-card space-y-6 p-5 sm:p-6">
          <div className="flex items-start gap-4 border-b pb-6">
            <Initials name={doctor?.name ?? ""} className="h-16 w-16 text-xl" />
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold">
                {doctor ? (
                  <Link
                    to="/doctors/$doctorId"
                    params={{ doctorId: doctor.id }}
                    className="hover:underline"
                  >
                    {doctor.name}
                  </Link>
                ) : (
                  "Doctor"
                )}
              </h2>
              {doctor ? (
                <p className="font-medium text-primary">{specialtyName(doctor.specialtyId)}</p>
              ) : null}
              {clinic ? <p className="mt-1 text-sm text-muted-foreground">{clinic.name}</p> : null}
            </div>
          </div>

          <dl className="grid gap-6 text-sm sm:grid-cols-2">
            <div className="space-y-2">
              <dt className="font-medium">Date & time</dt>
              <dd className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-foreground" aria-hidden />
                {longDate(appointment.date)}
              </dd>
              <dd className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 text-foreground" aria-hidden />
                {to12h(appointment.time)} IST
              </dd>
            </div>
            {clinic ? (
              <div className="space-y-2">
                <dt className="font-medium">Location</dt>
                <dd className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                  <span>{clinic.address}</span>
                </dd>
              </div>
            ) : null}
            {appointment.reason ? (
              <div className="space-y-2 sm:col-span-2">
                <dt className="font-medium">Reason for visit</dt>
                <dd className="text-muted-foreground">{appointment.reason}</dd>
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <dt className="font-medium">Consultation fee</dt>
              <dd className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
                <span className="text-muted-foreground">Not charged online</span>
                <span className="font-bold text-foreground">{inr(appointment.fee)}</span>
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3 border-t pt-6">
            <MessageClinicButton
              clinicId={appointment.clinicId}
              doctorId={appointment.doctorId}
              appointmentId={appointment.id}
            />
            {isCancellable(appointment) ? (
              <CancelAppointmentButton appointment={appointment} />
            ) : null}
          </div>
        </div>
      </div>
    </PatientShell>
  );
}
