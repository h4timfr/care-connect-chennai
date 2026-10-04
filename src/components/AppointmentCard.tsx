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
import { inr, longDate, specialtyName, to12h } from "@/lib/format";
import { useApp } from "@/lib/store";
import { describeCancelError, isCancellable } from "@/lib/supabase/appointments";
import type { Appointment } from "@/lib/types";

export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const { doctorById, clinicById } = useApp();
  const doctor = doctorById(appointment.doctorId);
  const clinic = clinicById(appointment.clinicId);

  return (
    <article className="surface-card p-4 sm:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Initials name={doctor?.name ?? ""} className="h-11 w-11" />
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">
            {doctor?.name ?? "Doctor"}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {[doctor ? specialtyName(doctor.specialtyId) : null, clinic?.name]
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
          <dt className="sr-only">Date</dt>
          <dd className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            {longDate(appointment.date)}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Time</dt>
          <dd className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {to12h(appointment.time)} IST
          </dd>
        </div>
        {clinic ? (
          <div className="min-w-0">
            <dt className="sr-only">Location</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{clinic.address}</span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">Fee</dt>
          <dd className="font-medium text-foreground">{inr(appointment.fee)} consultation</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/appointments/$appointmentId" params={{ appointmentId: appointment.id }}>
            View details
          </Link>
        </Button>
        <MessageClinicButton
          clinicId={appointment.clinicId}
          doctorId={appointment.doctorId}
          appointmentId={appointment.id}
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

  const confirm = async () => {
    setCancelling(true);
    try {
      await cancelAppointment(appointment.id);
      toast.success("Appointment cancelled");
      setOpen(false);
    } catch (err) {
      toast.error(describeCancelError(err));
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
          Cancel appointment
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
          <AlertDialogDescription>
            {doctor?.name ?? "Your appointment"} · {longDate(appointment.date)} at{" "}
            {to12h(appointment.time)} IST. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>Keep appointment</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={cancelling}>
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Cancel appointment
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
