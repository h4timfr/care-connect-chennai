import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, MapPin, Phone, SearchX } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import {
  EmptyState,
  ErrorState,
  PageLoader,
  Rating,
  ListingStatus,
  SectionHeader,
} from "@/components/common";
import { clinicCanPatientContact, clinicHasBookableDoctor } from "@/lib/supabase/queries";
import { DoctorCard } from "@/components/DoctorCard";
import { MessageClinicButton } from "@/components/MessageClinicButton";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { mailtoHref, telHref } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { describeDataError } from "@/lib/supabase/errors";

export const Route = createFileRoute("/clinics/$clinicId")({
  head: () => ({ meta: [{ title: "Clinic — CareConnect" }] }),
  component: ClinicProfile,
});

function ClinicProfile() {
  const { clinicId } = Route.useParams();
  const { clinicById, doctorsOfClinic, catalog } = useApp();

  const clinic = clinicById(clinicId);
  const { t, fmt } = useI18n();

  if (!clinic) {
    return (
      <PatientShell>
        {catalog.isLoading ? (
          <PageLoader label={t("clinic.loading")} />
        ) : catalog.error ? (
          <ErrorState
            title={t("clinic.loadError")}
            message={t(describeDataError(catalog.error))}
            onRetry={catalog.refetch}
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title={t("clinic.notFoundTitle")}
            description={t("clinic.notFoundBody")}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/discover" search={{ tab: "clinics" }}>
                  {t("clinic.browse")}
                </Link>
              </Button>
            }
          />
        )}
      </PatientShell>
    );
  }

  const doctors = doctorsOfClinic(clinic.id);
  const patientContactable = clinicCanPatientContact(clinic, doctors);
  const [minFee, maxFee] = clinic.feeRange;

  return (
    <PatientShell>
      <div className="mx-auto max-w-4xl space-y-8">
        <Link
          to="/discover"
          search={{ tab: "clinics" }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t("clinic.backToClinics")}
        </Link>

        <section className="surface-card overflow-hidden">
          <div className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-start sm:p-8">
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold">{clinic.name}</h1>
              {clinic.area ? (
                <p className="mt-1 text-lg text-muted-foreground">{clinic.area}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <Rating value={clinic.rating} count={clinic.reviewCount} sample={clinic.isSample} />
                {maxFee > 0 ? (
                  <span className="text-muted-foreground">
                    {t("clinic.consultations", { min: fmt.inr(minFee), max: fmt.inr(maxFee) })}
                  </span>
                ) : null}
                <ListingStatus
                  isSample={clinic.isSample}
                  contactable={patientContactable}
                  bookable={clinicHasBookableDoctor(clinic.id, doctors)}
                />
              </div>
            </div>
            <MessageClinicButton
              clinicId={clinic.id}
              contactable={patientContactable}
              size="lg"
              className="w-full sm:w-auto"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-8">
            <section aria-labelledby="clinic-about">
              <SectionHeader id="clinic-about" title={t("clinic.about")} />
              <p className="leading-relaxed text-muted-foreground" dir="auto">
                {clinic.about || t("doctor.noDescription")}
              </p>
              {clinic.specialtyIds.length ? (
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={t("common.specialties")}>
                  {clinic.specialtyIds.map((id) => (
                    <li
                      key={id}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {fmt.specialty(id)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section aria-labelledby="clinic-doctors">
              <SectionHeader id="clinic-doctors" title={t("clinic.doctors")} />
              {doctors.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {doctors.map((d) => (
                    <DoctorCard key={d.id} doctor={d} compact />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("clinic.noDoctors")}</p>
              )}
            </section>

            {clinic.services.length ? (
              <section aria-labelledby="clinic-services">
                <SectionHeader id="clinic-services" title={t("clinic.services")} />
                <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                  {clinic.services.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {clinic.facilities.length ? (
              <section aria-labelledby="clinic-facilities">
                <SectionHeader id="clinic-facilities" title={t("clinic.facilities")} />
                <ul className="flex flex-wrap gap-2">
                  {clinic.facilities.map((f) => (
                    <li key={f} className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium">
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6">
            <section className="surface-card space-y-4 p-5" aria-labelledby="clinic-contact">
              <h2 id="clinic-contact" className="font-display text-lg font-semibold">
                {t("clinic.contact")}
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
                  {clinic.address}
                </p>
                {patientContactable && telHref(clinic.phone) ? (
                  <a
                    href={telHref(clinic.phone) ?? undefined}
                    className="flex items-center gap-2 hover:text-foreground"
                  >
                    <Phone className="h-4 w-4 text-foreground" aria-hidden />
                    <span dir="ltr">{clinic.phone}</span>
                  </a>
                ) : null}
                {patientContactable && mailtoHref(clinic.email) ? (
                  <a
                    href={mailtoHref(clinic.email) ?? undefined}
                    className="flex items-center gap-2 break-all hover:text-foreground"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                    <span dir="ltr">{clinic.email}</span>
                  </a>
                ) : null}
              </div>
            </section>

            <section className="surface-card space-y-3 p-5" aria-labelledby="clinic-hours">
              <h2 id="clinic-hours" className="font-display text-lg font-semibold">
                {t("clinic.openingHours")}
              </h2>
              {clinic.openingHours.length ? (
                <dl className="space-y-2 text-sm">
                  {clinic.openingHours.map((h) => (
                    <div
                      key={h.day}
                      className="flex justify-between border-b pb-2 last:border-0 last:pb-0"
                    >
                      <dt className="text-muted-foreground">{h.day}</dt>
                      <dd className="text-end font-medium">{h.hours}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">{t("clinic.noOpeningHours")}</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </PatientShell>
  );
}
