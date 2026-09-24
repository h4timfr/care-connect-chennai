import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Clock, MapPin, Stethoscope } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { Button } from "@/components/ui/button";
import { inr, longDate, to12h } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useState } from "react";
import { toast } from "sonner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export const Route = createFileRoute("/book/$doctorId")({
  component: BookAppointment,
  validateSearch: (search: Record<string, unknown>) => {
    const params: { date?: string; time?: string; reschedule?: string } = {};
    if (typeof search["date"] === "string" && search["date"]) {
      params.date = search["date"];
    }
    if (typeof search["time"] === "string" && search["time"]) {
      params.time = search["time"];
    }
    if (typeof search["reschedule"] === "string" && search["reschedule"]) {
      params.reschedule = search["reschedule"];
    }
    return params;
  },
});

function BookAppointment() {
  const { doctorId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { loading, user } = useProtectedRoute(`/book/${doctorId}`);
  const { doctorById, clinicById, patient, bookAppointment } = useApp();

  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!patient) {
    return (
      <PatientShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
          <Stethoscope className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Authentication Required</h1>
          <p className="text-muted-foreground">
            You must complete your profile to book an appointment.
          </p>
          <Button asChild>
            <Link to="/profile">Go to Profile</Link>
          </Button>
        </div>
      </PatientShell>
    );
  }

  const doctor = doctorById(doctorId);
  const clinic = doctor ? clinicById(doctor.clinicIds?.[0] || "") : undefined;

  if (!doctor) {
    return (
      <PatientShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <h1 className="text-2xl font-bold mb-2">Doctor not found</h1>
          <p className="text-muted-foreground mb-4">
            Cannot book an appointment because the doctor was not found.
          </p>
          <Button onClick={() => window.history.back()}>Go Back</Button>
        </div>
      </PatientShell>
    );
  }

  const handleBook = async () => {
    if (!search.date || !search.time) {
      toast.error("Please select a date and time");
      return;
    }

    setIsSubmitting(true);
    try {
      await bookAppointment({
        doctorId: doctor.id,
        clinicId: doctor.clinicIds?.[0] || "",
        date: search.date!,
        time: search.time!,
        reason: reason || "Routine consultation",
        patientName: patient.name,
        patientPhone: patient.phone,
        fee: doctor.consultationFee,
      });
      setIsSubmitting(false);
      toast.success("Appointment booked successfully!");
      navigate({ to: "/appointments" });
    } catch (err) {
      const e = err as Error;
      toast.error(e.message || "Failed to book appointment");
      setIsSubmitting(false);
    }
  };

  return (
    <PatientShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="font-display text-2xl font-bold">Review & Confirm</h1>

        <div className="space-y-6">
          <section className="surface-card p-6 space-y-4">
            <h2 className="font-medium text-lg border-b pb-3">Provider Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Doctor</p>
                <p className="font-medium flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  {doctor.name}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Clinic</p>
                <p className="font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {clinic?.name}
                </p>
              </div>
            </div>
          </section>

          <section className="surface-card p-6 space-y-4">
            <h2 className="font-medium text-lg border-b pb-3">Time & Date</h2>
            {search.date && search.time ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Date</p>
                  <p className="font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    {longDate(search.date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Time</p>
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    {to12h(search.time)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground bg-muted p-4 rounded-lg flex justify-between items-center">
                No time selected.
                <Button variant="outline" size="sm" asChild>
                  <Link to="/doctors/$doctorId" params={{ doctorId: doctor.id }}>
                    Select Time
                  </Link>
                </Button>
              </div>
            )}
          </section>

          <section className="surface-card p-6 space-y-4">
            <h2 className="font-medium text-lg border-b pb-3">Patient Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Name</p>
                <p className="font-medium">{patient.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Phone</p>
                <p className="font-medium">{patient.phone}</p>
              </div>
            </div>
            <div className="pt-2">
              <label className="text-sm text-muted-foreground mb-1 block">
                Reason for visit (optional)
              </label>
              <input
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm"
                placeholder="E.g. Routine checkup, fever..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </section>

          <section className="surface-card p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-medium text-lg">Consultation Fee</h2>
              <span className="font-bold text-xl">{inr(doctor.consultationFee)}</span>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={!search.date || !search.time || isSubmitting}
              onClick={handleBook}
            >
              {isSubmitting ? "Confirming..." : "Confirm Booking"}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Payment is collected at the clinic. By confirming, you agree to our cancellation
              policy.
            </p>
          </section>
        </div>
      </div>
    </PatientShell>
  );
}
