import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Clock, MapPin, SearchX } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { CancelAppointmentButton } from "@/components/AppointmentCard";
import { isCancellable, isPastAppointment } from "@/lib/supabase/appointments";
import type { Appointment } from "@/lib/types";
import { MessageClinicButton } from "@/components/MessageClinicButton";
import { CatalogNotice } from "@/components/CatalogNotice";
import { EmptyState, ErrorState, Initials, PageLoader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { describeDataError } from "@/lib/supabase/errors";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export const Route = createFileRoute("/appointments/$appointmentId")({
  head: () => ({ meta: [{ title: "Appointment details — CareConnect" }] }),
  component: AppointmentDetails,
});

function statusHelp(appointment: Appointment): MessageKey {
  if (isPastAppointment(appointment)) {
    if (appointment.status === "pending") return "appointmentDetails.help.expiredRequest";
    if (appointment.status === "confirmed") return "appointmentDetails.help.datePassed";
  }
  return `appointmentDetails.help.${appointment.status}`;
}

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
  const { t, fmt } = useI18n();

  const appointment = patientAppointments.find((a) => a.id === appointmentId);

  // Also wait while a refetch is in flight if the appointment isn't in the cached list yet:
  // it may simply be newer than the cache (e.g. just booked, or created in another tab).
  if (
    loading ||
    !user ||
    isLoadingPatient ||
    status.isLoading ||
    (!appointment && status.isFetching)
  ) {
    return (
      <PatientShell>
        <PageLoader label={t("appointmentDetails.loading")} />
      </PatientShell>
    );
  }

  if (status.error) {
    return (
      <PatientShell>
        <ErrorState
          title={t("appointmentDetails.loadError")}
          message={t(describeDataError(status.error))}
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
          title={t("appointmentDetails.notFoundTitle")}
          description={t("appointmentDetails.notFoundBody")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/appointments">{t("appointmentDetails.backToList")}</Link>
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
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t("appointmentDetails.all")}
        </Link>
        <CatalogNotice />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold">{t("appointmentDetails.title")}</h1>
          <StatusBadge status={appointment.status} />
        </div>
        <p className="text-sm text-muted-foreground">{t(statusHelp(appointment))}</p>

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
                  t("common.doctor")
                )}
              </h2>
              {doctor ? (
                <p className="font-medium text-primary">{fmt.specialty(doctor.specialtyId)}</p>
              ) : null}
              {clinic ? <p className="mt-1 text-sm text-muted-foreground">{clinic.name}</p> : null}
            </div>
          </div>

          <dl className="grid gap-6 text-sm sm:grid-cols-2">
            <div className="space-y-2">
              <dt className="font-medium">{t("appointmentDetails.dateTime")}</dt>
              <dd className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-foreground" aria-hidden />
                {fmt.longDate(appointment.date)}
              </dd>
              <dd className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 text-foreground" aria-hidden />
                {fmt.timeIst(appointment.time)}
              </dd>
            </div>
            {clinic ? (
              <div className="space-y-2">
                <dt className="font-medium">{t("appointment.location")}</dt>
                <dd className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                  <span>{clinic.address}</span>
                </dd>
              </div>
            ) : null}
            {appointment.reason ? (
              <div className="space-y-2 sm:col-span-2">
                <dt className="font-medium">{t("appointmentDetails.reason")}</dt>
                <dd className="text-muted-foreground">{appointment.reason}</dd>
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <dt className="font-medium">{t("appointmentDetails.fee")}</dt>
              <dd className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
                <span className="text-muted-foreground">
                  {t("appointmentDetails.notChargedOnline")}
                </span>
                <span className="font-bold text-foreground">{fmt.inr(appointment.fee)}</span>
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
