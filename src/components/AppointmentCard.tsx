import { Link } from "@tanstack/react-router";
import { CalendarDays, Clock, Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Initials, StatusBadge } from "@/components/common";
import { MessageClinicButton } from "@/components/MessageClinicButton";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { describeCancelError, isCancellable } from "@/lib/supabase/appointments";
import { doctorCanPatientContact } from "@/lib/supabase/queries";
import type { Appointment } from "@/lib/types";

export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const { doctorById, clinicById } = useApp();
  const doctor = doctorById(appointment.doctorId);
  const clinic = clinicById(appointment.clinicId);
  const { t, fmt } = useI18n();

  return (
    <article className="surface-card p-4 sm:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Initials name={doctor?.name ?? ""} className="h-11 w-11" />
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">
            {doctor?.name ?? t("common.doctor")}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {[doctor ? fmt.specialty(doctor.specialtyId) : null, clinic?.name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <StatusBadge status={appointment.status} />
        </div>
      </div>

      <dl className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="sr-only">{t("appointment.date")}</dt>
          <dd className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            {fmt.longDate(appointment.date)}
          </dd>
        </div>
        <div>
          <dt className="sr-only">{t("appointment.time")}</dt>
          <dd className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {fmt.timeIst(appointment.time)}
          </dd>
        </div>
        {clinic ? (
          <div className="min-w-0">
            <dt className="sr-only">{t("appointment.location")}</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{clinic.address}</span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{t("appointment.fee")}</dt>
          <dd className="font-medium text-foreground">
            {t("common.consultationFee", { fee: fmt.inr(appointment.fee) })}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/appointments/$appointmentId" params={{ appointmentId: appointment.id }}>
            {t("appointment.viewDetails")}
          </Link>
        </Button>
        <MessageClinicButton
          clinicId={appointment.clinicId}
          doctorId={appointment.doctorId}
          appointmentId={appointment.id}
          contactable={doctor ? doctorCanPatientContact(doctor, appointment.clinicId) : false}
        />
        {isCancellable(appointment) ? <CancelAppointmentButton appointment={appointment} /> : null}
      </div>
    </article>
  );
}

export function CancelAppointmentButton({
  appointment,
  className,
}: {
  appointment: Appointment;
  className?: string;
}) {
  const { cancelAppointment, doctorById } = useApp();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const doctor = doctorById(appointment.doctorId);
  const { t, fmt } = useI18n();

  const confirm = async () => {
    setCancelling(true);
    try {
      await cancelAppointment(appointment.id);
      toast.success(t("appointment.cancelled"));
      setOpen(false);
    } catch (err) {
      toast.error(t(describeCancelError(err)));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !cancelling && setOpen(next)}>
      {/* A real trigger lets Radix return focus to this button when the dialog closes. */}
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className ?? "text-destructive hover:bg-destructive/10 hover:text-destructive"}
        >
          {t("appointment.cancel")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("appointment.cancelTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("appointment.cancelBody", {
              doctor: doctor?.name ?? t("appointment.yourAppointment"),
              date: fmt.longDate(appointment.date),
              time: fmt.time(appointment.time),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>{t("appointment.keep")}</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={cancelling}>
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("appointment.cancel")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
