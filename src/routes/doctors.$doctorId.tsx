import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarX, GraduationCap, Languages, MapPin, SearchX } from "lucide-react";
import { useState } from "react";
import { PatientShell } from "@/components/layout/PatientShell";
import {
  EmptyState,
  ErrorState,
  Initials,
  InfoNotice,
  PageLoader,
  Rating,
  ListingStatus,
} from "@/components/common";
import { MessageClinicButton } from "@/components/MessageClinicButton";
import { DateStrip, SlotGrid } from "@/components/SlotPicker";
import { Button } from "@/components/ui/button";
import { isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { describeDataError } from "@/lib/supabase/errors";
import { bookableClinicIds, doctorCanPatientContact } from "@/lib/supabase/queries";

export const Route = createFileRoute("/doctors/$doctorId")({
  head: () => ({ meta: [{ title: "Doctor profile — CareConnect" }] }),
  component: DoctorProfile,
});

function DoctorProfile() {
  const { doctorId } = Route.useParams();
  const { doctorById, clinicById, catalog } = useApp();
  const navigate = useNavigate();
  const [date, setDate] = useState(() => isoDate(new Date()));
  const { t, fmt } = useI18n();

  const doctor = doctorById(doctorId);

  if (!doctor) {
    return (
      <PatientShell>
        {catalog.isLoading ? (
          <PageLoader label={t("doctor.loading")} />
        ) : catalog.error ? (
          <ErrorState
            title={t("doctor.loadError")}
            message={t(describeDataError(catalog.error))}
            onRetry={catalog.refetch}
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title={t("doctor.notFoundTitle")}
            description={t("doctor.notFoundBody")}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/discover">{t("common.findDoctors")}</Link>
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
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t("doctor.backToSearch")}
        </Link>

        <section className="surface-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Initials name={doctor.name} className="h-20 w-20 shrink-0 text-2xl" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h1 className="font-display text-2xl font-bold">{doctor.name}</h1>
                <p className="text-lg text-primary">{fmt.specialty(doctor.specialtyId)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <GraduationCap className="h-4 w-4" aria-hidden />{" "}
                  {t.plural("common.experience", doctor.experienceYears)}
                </span>
                {doctor.languages.length ? (
                  <span className="flex items-center gap-1">
                    <Languages className="h-4 w-4" aria-hidden />{" "}
                    <span className="sr-only">{t("common.languages")}: </span>
                    {doctor.languages.map(fmt.languageName).join(" · ")}
                  </span>
                ) : null}
                <Rating value={doctor.rating} count={doctor.reviewCount} sample={doctor.isSample} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-muted px-3 py-1 font-medium">
                  {t("common.consultationFee", { fee: fmt.inr(doctor.consultationFee) })}
                </span>
                <ListingStatus
                  isSample={doctor.isSample}
                  contactable={doctorCanPatientContact(doctor)}
                  bookable={bookable.size > 0}
                />
              </div>
            </div>
            {bookable.size ? (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/book/$doctorId" params={{ doctorId: doctor.id }}>
                  {t("doctor.bookAppointment")}
                </Link>
              </Button>
            ) : null}
          </div>
          {/* Booking is an independent, platform-controlled capability. */}
          {!bookable.size ? (
            <div
              className="mt-5 flex items-start gap-3 rounded-lg border bg-muted/50 p-4 text-sm"
              data-testid="booking-unavailable"
            >
              <CalendarX className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{t("doctor.bookingUnavailable")}</p>
                <p className="mt-0.5 text-muted-foreground">{t("doctor.bookingUnavailableBody")}</p>
              </div>
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            <section className="surface-card space-y-5 p-5 sm:p-6" aria-labelledby="about-heading">
              <h2 id="about-heading" className="font-display text-lg font-semibold">
                {t("doctor.about")}
              </h2>
              {doctor.about ? (
                <p className="text-sm leading-relaxed text-muted-foreground" dir="auto">
                  {doctor.about}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("doctor.noDescription")}</p>
              )}
              {doctor.qualifications.length ? (
                <div>
                  <h3 className="mb-1 text-sm font-medium">{t("doctor.qualifications")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {doctor.qualifications.join(", ")}
                  </p>
                </div>
              ) : null}
              {doctor.services.length ? (
                <div>
                  <h3 className="mb-1 text-sm font-medium">{t("doctor.services")}</h3>
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
              {t("doctor.locations")}
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
                        <MessageClinicButton
                          clinicId={clinic.id}
                          doctorId={doctor.id}
                          contactable={doctorCanPatientContact(doctor, clinic.id)}
                        />
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
                          {t("doctor.notBookableAt", { clinic: clinic.name })}
                        </InfoNotice>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("doctor.noLocations")}</p>
            )}
          </section>
        </div>
      </div>
    </PatientShell>
  );
}
