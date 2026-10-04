import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, GraduationCap, Languages, MapPin, Phone, SearchX } from "lucide-react";
import { useState } from "react";
import { PatientShell } from "@/components/layout/PatientShell";
import {
  EmptyState,
  ErrorState,
  Initials,
  InfoNotice,
  PageLoader,
  Rating,
  SampleBadge,
} from "@/components/common";
import { MessageClinicButton } from "@/components/MessageClinicButton";
import { DateStrip, SlotGrid } from "@/components/SlotPicker";
import { Button } from "@/components/ui/button";
import { inr, isoDate, pluralize, specialtyName } from "@/lib/format";
import { useApp } from "@/lib/store";
import { describeDataError } from "@/lib/supabase/errors";
import { bookableClinicIds } from "@/lib/supabase/queries";

export const Route = createFileRoute("/doctors/$doctorId")({
  head: () => ({ meta: [{ title: "Doctor profile — CareConnect" }] }),
  component: DoctorProfile,
});

function DoctorProfile() {
  const { doctorId } = Route.useParams();
  const { doctorById, clinicById, catalog } = useApp();
  const navigate = useNavigate();
  const [date, setDate] = useState(() => isoDate(new Date()));

  const doctor = doctorById(doctorId);

  if (!doctor) {
    return (
      <PatientShell>
        {catalog.isLoading ? (
          <PageLoader label="Loading doctor…" />
        ) : catalog.error ? (
          <ErrorState
            title="We couldn't load this doctor"
            message={describeDataError(catalog.error)}
            onRetry={catalog.refetch}
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Doctor not found"
            description="This doctor isn't listed on CareConnect, or the link is out of date."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/discover">Find doctors</Link>
              </Button>
            }
          />
        )}
      </PatientShell>
    );
  }

  const bookable = new Set(bookableClinicIds(doctor));
  const locations = doctor.clinicIds
    .map((id) => clinicById(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <PatientShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          to="/discover"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to search
        </Link>

        <section className="surface-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Initials name={doctor.name} className="h-20 w-20 shrink-0 text-2xl" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h1 className="font-display text-2xl font-bold">{doctor.name}</h1>
                <p className="text-lg text-primary">{specialtyName(doctor.specialtyId)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <GraduationCap className="h-4 w-4" aria-hidden />{" "}
                  {pluralize(doctor.experienceYears, "year")} experience
                </span>
                {doctor.languages.length ? (
                  <span className="flex items-center gap-1">
                    <Languages className="h-4 w-4" aria-hidden /> {doctor.languages.join(", ")}
                  </span>
                ) : null}
                <Rating value={doctor.rating} count={doctor.reviewCount} sample={doctor.isSample} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-muted px-3 py-1 font-medium">
                  {inr(doctor.consultationFee)} consultation
                </span>
                {doctor.isSample ? <SampleBadge /> : null}
              </div>
            </div>
            {bookable.size ? (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/book/$doctorId" params={{ doctorId: doctor.id }}>
                  Book appointment
                </Link>
              </Button>
            ) : null}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            <section className="surface-card space-y-5 p-5 sm:p-6" aria-labelledby="about-heading">
              <h2 id="about-heading" className="font-display text-lg font-semibold">
                About
              </h2>
              {doctor.about ? (
                <p className="text-sm leading-relaxed text-muted-foreground">{doctor.about}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description provided.</p>
              )}
              {doctor.qualifications.length ? (
                <div>
                  <h3 className="mb-1 text-sm font-medium">Qualifications</h3>
                  <p className="text-sm text-muted-foreground">
                    {doctor.qualifications.join(", ")}
                  </p>
                </div>
              ) : null}
              {doctor.services.length ? (
                <div>
                  <h3 className="mb-1 text-sm font-medium">Services</h3>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {doctor.services.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {doctor.registrationNote ? (
                <p className="text-xs text-muted-foreground">{doctor.registrationNote}</p>
              ) : null}
            </section>
          </div>

          <section
            className="surface-card space-y-5 p-5 sm:p-6"
            aria-labelledby="locations-heading"
          >
            <h2 id="locations-heading" className="font-display text-lg font-semibold">
              Locations & availability
            </h2>
            {locations.length ? (
              <>
                {bookable.size ? <DateStrip value={date} onChange={setDate} /> : null}
                <ul className="space-y-6">
                  {locations.map((clinic) => (
                    <li
                      key={clinic.id}
                      className="space-y-3 border-t pt-5 first:border-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-medium">
                            <Link
                              to="/clinics/$clinicId"
                              params={{ clinicId: clinic.id }}
                              className="hover:underline"
                            >
                              {clinic.name}
                            </Link>
                          </h3>
                          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            {clinic.address}
                          </p>
                        </div>
                        <MessageClinicButton clinicId={clinic.id} doctorId={doctor.id} />
                      </div>
                      {bookable.has(clinic.id) ? (
                        <SlotGrid
                          doctorId={doctor.id}
                          clinicId={clinic.id}
                          date={date}
                          onChange={(time) =>
                            navigate({
                              to: "/book/$doctorId",
                              params: { doctorId: doctor.id },
                              search: { date, time, clinicId: clinic.id },
                            })
                          }
                        />
                      ) : (
                        <InfoNotice>
                          Online booking isn't available for this doctor at {clinic.name} yet.
                          {clinic.phone ? (
                            <>
                              {" "}
                              To book, call the clinic on{" "}
                              <a
                                href={`tel:${clinic.phone.replace(/\s+/g, "")}`}
                                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
                              >
                                <Phone className="h-3 w-3" aria-hidden />
                                {clinic.phone}
                              </a>
                              .
                            </>
                          ) : null}
                        </InfoNotice>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This doctor isn't currently practising at any listed clinic.
              </p>
            )}
          </section>
        </div>
      </div>
    </PatientShell>
  );
}
