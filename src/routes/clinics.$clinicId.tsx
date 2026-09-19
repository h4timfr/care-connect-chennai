import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Clock, MapPin, Phone, Mail } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { Rating, SectionHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DoctorCard } from "@/components/DoctorCard";

export const Route = createFileRoute("/clinics/$clinicId")({
  component: ClinicProfile,
});

function ClinicProfile() {
  const { clinicId } = Route.useParams();
  const app = useApp();

  const clinic = app.clinicById(clinicId);
  const clinicDoctors = app.doctorsOfClinic(clinicId);

  const router = useRouter();
  if (!clinic) {
    return (
      <PatientShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <h1 className="text-2xl font-bold mb-2">Clinic not found</h1>
          <p className="text-muted-foreground mb-4">
            The clinic you are looking for does not exist or has been removed.
          </p>
          <Button onClick={() => window.history.back()}>Go Back</Button>
        </div>
      </PatientShell>
    );
  }

  return (
    <PatientShell>
      <div className="mx-auto max-w-4xl space-y-8">
        <button
          onClick={() => router.history.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="surface-card overflow-hidden">
          <div className={cn("h-32 sm:h-48", "bg-gradient-to-br", clinic.photoTone)}></div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
              <div>
                <h1 className="font-display text-3xl font-bold">{clinic.name}</h1>
                <p className="text-muted-foreground mt-1 text-lg">{clinic.area}</p>
                <div className="flex items-center gap-4 mt-3 text-sm font-medium">
                  <Rating value={clinic.rating} count={clinic.reviewCount} />
                  <span className="text-muted-foreground">
                    {inr(clinic.feeRange[0])} – {inr(clinic.feeRange[1])}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0 sm:w-48">
                <Button asChild size="lg" className="w-full">
                  <Link to="/">Book Appointment</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="w-full">
                  <Link to="/messages">Message Clinic</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[1fr_300px]">
          <div className="space-y-8">
            <section>
              <SectionHeader title="About" />
              <p className="text-muted-foreground leading-relaxed">{clinic.about}</p>
            </section>

            <section>
              <SectionHeader title="Doctors" />
              <div className="grid gap-4 sm:grid-cols-2">
                {clinicDoctors.map((d) => (
                  <DoctorCard key={d.id} doctor={d} compact />
                ))}
              </div>
            </section>

            <section>
              <SectionHeader title="Services" />
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                {(clinic.services || []).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>

            <section>
              <SectionHeader title="Facilities" />
              <div className="flex flex-wrap gap-2">
                {(clinic.facilities || []).map((f) => (
                  <span key={f} className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium">
                    {f}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="surface-card p-5 space-y-4">
              <h2 className="font-display font-semibold text-lg">Contact</h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-foreground" />
                  {clinic.address}
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-foreground" />
                  {clinic.phone}
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-foreground" />
                  {clinic.email}
                </p>
              </div>
            </section>

            <section className="surface-card p-5 space-y-4">
              <h2 className="font-display font-semibold text-lg">Hours</h2>
              <div className="space-y-2 text-sm">
                {(clinic.openingHours || []).map((h) => (
                  <div
                    key={h.day}
                    className="flex justify-between border-b last:border-0 pb-2 last:pb-0"
                  >
                    <span className="text-muted-foreground">{h.day}</span>
                    <span className="font-medium text-right">{h.hours}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </PatientShell>
  );
}
