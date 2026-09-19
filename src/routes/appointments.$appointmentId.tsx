import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Clock, MapPin, MessageCircle } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { Button } from "@/components/ui/button";
import { StatusBadge, Initials } from "@/components/common";
import { useApp } from "@/lib/store";
import { specialtyName } from "@/lib/format";
import { longDate, to12h, inr } from "@/lib/format";

export const Route = createFileRoute("/appointments/$appointmentId")({
  component: AppointmentDetails,
  loader: ({ params }) => ({ appointmentId: params.appointmentId }),
});

function AppointmentDetails() {
  const { appointmentId } = Route.useLoaderData();
  const app = useApp();
  const { appointments, cancelAppointment, ensureConversation } = app;
  const router = useRouter();

  const appointment = appointments.find((a) => a.id === appointmentId);

  if (!appointment) {
    return (
      <PatientShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <h1 className="text-2xl font-bold mb-2">Appointment not found</h1>
          <p className="text-muted-foreground mb-4">
            The appointment you are looking for does not exist.
          </p>
          <Button onClick={() => router.history.back()}>Go Back</Button>
        </div>
      </PatientShell>
    );
  }

  const doctor = app.doctorById(appointment.doctorId);
  const clinic = app.clinicById(appointment.clinicId);
  const active = appointment.status === "confirmed" || appointment.status === "pending";

  const openChat = async () => {
    const cvId = await ensureConversation({
      clinicId: appointment.clinicId,
      doctorId: appointment.doctorId,
      appointmentId: appointment.id,
    });
    router.navigate({ to: "/messages", search: { c: cvId } });
  };

  return (
    <PatientShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          onClick={() => router.history.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Appointment Details</h1>
          <StatusBadge status={appointment.status} />
        </div>

        <div className="surface-card p-6 space-y-6">
          <div className="flex items-start gap-4 border-b pb-6">
            <Initials name={doctor?.name ?? "Dr"} className="h-16 w-16 text-xl" />
            <div>
              <h2 className="font-display text-xl font-bold">{doctor?.name}</h2>
              <p className="text-primary font-medium">{specialtyName(doctor?.specialtyId ?? "")}</p>
              <p className="text-muted-foreground text-sm mt-1">{clinic?.name}</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-medium mb-3">Time & Date</h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-foreground" />
                  {longDate(appointment.date)}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-foreground" />
                  {to12h(appointment.time)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-3">Location</h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-foreground" />
                  <span>{clinic?.address}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-medium mb-3">Payment</h3>
            <div className="flex justify-between items-center bg-muted px-4 py-3 rounded-lg">
              <span className="text-sm font-medium">Consultation Fee</span>
              <span className="font-bold">{inr(appointment.fee)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-right">Payment at clinic</p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {active && (
              <>
                <Button asChild className="flex-1">
                  <Link
                    to="/book/$doctorId"
                    params={{ doctorId: appointment.doctorId }}
                    search={{ reschedule: appointment.id }}
                  >
                    Reschedule
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Cancel this appointment?")) cancelAppointment(appointment.id);
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
            <Button variant="outline" className="flex-1" onClick={openChat}>
              <MessageCircle className="h-4 w-4" /> Message Clinic
            </Button>
          </div>
        </div>
      </div>
    </PatientShell>
  );
}
