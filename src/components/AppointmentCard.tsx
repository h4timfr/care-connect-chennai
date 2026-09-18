import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Clock, MapPin, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Initials, StatusBadge } from "@/components/common";
import { clinicById, doctorById, specialtyName } from "@/data/mock";
import { inr, longDate, to12h } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Appointment } from "@/lib/types";

export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const { cancelAppointment, ensureConversation } = useApp();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const doctor = doctorById(appointment.doctorId);
  const clinic = clinicById(appointment.clinicId);
  const active = appointment.status === "confirmed" || appointment.status === "pending";

  const openChat = async () => {
    const id = await ensureConversation({
      clinicId: appointment.clinicId,
      doctorId: appointment.doctorId,
      appointmentId: appointment.id,
    });
    navigate({ to: "/messages", search: { c: id } });
  };

  return (
    <article className="surface-card p-4 sm:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <Initials name={doctor?.name ?? "Doctor"} className="h-11 w-11" />
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">{doctor?.name}</h3>
          <p className="truncate text-sm text-muted-foreground">
            {specialtyName(doctor?.specialtyId ?? "general")} · {clinic?.name}
          </p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      <dl className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
          {longDate(appointment.date)}
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          {to12h(appointment.time)}
        </div>
        <div className="flex items-center gap-2 truncate">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">
            {clinic?.area} · {clinic?.address}
          </span>
        </div>
        <div className="font-medium text-foreground">{inr(appointment.fee)} consultation</div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/appointments/$appointmentId" params={{ appointmentId: appointment.id }}>
            View details
          </Link>
        </Button>
        {active ? (
          <Button asChild variant="outline" size="sm">
            <Link
              to="/book/$doctorId"
              params={{ doctorId: appointment.doctorId }}
              search={{ reschedule: appointment.id }}
            >
              Reschedule
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={openChat}>
          <MessageCircle className="h-4 w-4" aria-hidden />
          Message clinic
        </Button>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              {doctor?.name} · {longDate(appointment.date)} at {to12h(appointment.time)}. Free
              cancellation up to 2 hours before the slot in this demo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                cancelAppointment(appointment.id);
                toast.success("Appointment cancelled");
              }}
            >
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
