import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Clock, GraduationCap, MapPin, MessageCircle, Star } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { Initials, Rating, SectionHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  doctorById,
  clinicById,
  scheduleOf,
  slotsForDoctor,
  REVIEWS,
  specialtyName,
} from "@/data/mock";
import { isoDate, addDays, inr, to12h, relativeDay } from "@/lib/format";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DateStrip, SlotGrid } from "@/components/SlotPicker";

export const Route = createFileRoute("/doctors/$doctorId")({
  component: DoctorProfile,
  loader: ({ params }) => {
    const doctor = doctorById(params.doctorId);
    return { doctor, doctorId: params.doctorId };
  },
});

function DoctorProfile() {
  const { doctor, doctorId } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();

  const [date, setDate] = useState(isoDate(new Date()));

  if (!doctor) {
    return (
      <PatientShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
           <h1 className="text-2xl font-bold mb-2">Doctor not found</h1>
           <p className="text-muted-foreground mb-4">The doctor you are looking for does not exist or has been removed.</p>
           <Button onClick={() => window.history.back()}>Go Back</Button>
        </div>
      </PatientShell>
    );
  }

  const clinic = clinicById(doctor.clinicId);
  const schedule = scheduleOf(doctor.id);
  const reviews = REVIEWS.filter((r) => r.doctorId === doctor.id);

  return (
    <PatientShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          onClick={() => router.history.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="surface-card p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Initials name={doctor.name} className="h-20 w-20 text-2xl shrink-0" />
            <div className="flex-1 space-y-4">
              <div>
                <h1 className="font-display text-2xl font-bold">{doctor.name}</h1>
                <p className="text-lg text-primary">{specialtyName(doctor.specialtyId)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <GraduationCap className="h-4 w-4" /> {doctor.experienceYears} yrs experience
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {doctor.rating} (
                    {doctor.reviewCount} reviews)
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-muted px-3 py-1 font-medium">
                  {inr(doctor.consultationFee)}
                </span>
                <span className="rounded-full bg-muted px-3 py-1">
                  {doctor.languages.join(", ")}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:w-48">
              <Button asChild size="lg" className="w-full">
                <Link to="/book/$doctorId" params={{ doctorId: doctor.id }}>
                  Book Appointment
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link to="/messages">Message Clinic</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <section className="surface-card p-6">
              <h2 className="font-display text-lg font-semibold mb-3">About</h2>
              <p className="text-muted-foreground leading-relaxed text-sm">{doctor.about}</p>

              <div className="mt-6">
                <h3 className="font-medium text-sm mb-2 text-foreground">Qualifications</h3>
                <p className="text-sm text-muted-foreground">{doctor.qualifications.join(", ")}</p>
              </div>

              <div className="mt-4">
                <h3 className="font-medium text-sm mb-2 text-foreground">
                  Services & Specializations
                </h3>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {doctor.services.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="surface-card p-6">
              <h2 className="font-display text-lg font-semibold mb-3 text-foreground">
                Clinic Info
              </h2>
              {clinic && (
                <div>
                  <h3 className="font-medium text-foreground">
                    <Link
                      to="/clinics/$clinicId"
                      params={{ clinicId: clinic.id }}
                      className="hover:underline"
                    >
                      {clinic.name}
                    </Link>
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-start gap-1.5 mt-1">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    {clinic.address}
                  </p>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="surface-card p-6">
              <h2 className="font-display text-lg font-semibold mb-4">Availability</h2>
              <div className="space-y-6">
                <DateStrip value={date} onChange={setDate} />
                <SlotGrid
                  doctorId={doctor.id}
                  date={date}
                  onChange={(time) =>
                    router.navigate({
                      to: "/book/$doctorId",
                      params: { doctorId: doctor.id },
                      search: { date, time },
                    })
                  }
                />
              </div>
            </section>

            {reviews.length > 0 && (
              <section className="surface-card p-6">
                <h2 className="font-display text-lg font-semibold mb-4">Patient Reviews</h2>
                <div className="space-y-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="border-b last:border-0 pb-4 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{r.author}</span>
                        <Rating value={r.rating} count={0} />
                      </div>
                      <p className="text-sm text-muted-foreground">{r.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </PatientShell>
  );
}
