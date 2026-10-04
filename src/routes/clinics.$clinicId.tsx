import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, MapPin, Phone, SearchX } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import {
  EmptyState,
  ErrorState,
  PageLoader,
  Rating,
  SampleBadge,
  SectionHeader,
} from "@/components/common";
import { DoctorCard } from "@/components/DoctorCard";
import { MessageClinicButton } from "@/components/MessageClinicButton";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { inr, specialtyName } from "@/lib/format";
import { describeDataError } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/clinics/$clinicId")({
  head: () => ({ meta: [{ title: "Clinic — CareConnect" }] }),
  component: ClinicProfile,
});

function ClinicProfile() {
  const { clinicId } = Route.useParams();
  const { clinicById, doctorsOfClinic, catalog } = useApp();

  const clinic = clinicById(clinicId);

  if (!clinic) {
    return (
      <PatientShell>
        {catalog.isLoading ? (
          <PageLoader label="Loading clinic…" />
        ) : catalog.error ? (
          <ErrorState
            title="We couldn't load this clinic"
            message={describeDataError(catalog.error)}
            onRetry={catalog.refetch}
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Clinic not found"
            description="This clinic isn't listed on CareConnect, or the link is out of date."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/discover" search={{ tab: "clinics" }}>
                  Browse clinics
                </Link>
              </Button>
            }
          />
        )}
      </PatientShell>
    );
  }

  const doctors = doctorsOfClinic(clinic.id);
  const [minFee, maxFee] = clinic.feeRange;

  return (
    <PatientShell>
      <div className="mx-auto max-w-4xl space-y-8">
        <Link
          to="/discover"
          search={{ tab: "clinics" }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to clinics
        </Link>

        <section className="surface-card overflow-hidden">
          <div className={cn("h-28 bg-gradient-to-br sm:h-40", clinic.photoTone)} aria-hidden />
          <div className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-start sm:p-8">
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold">{clinic.name}</h1>
              {clinic.area ? (
                <p className="mt-1 text-lg text-muted-foreground">{clinic.area}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <Rating value={clinic.rating} count={clinic.reviewCount} />
                {maxFee > 0 ? (
                  <span className="text-muted-foreground">
                    Consultations {inr(minFee)} – {inr(maxFee)}
                  </span>
                ) : null}
                {clinic.isSample ? <SampleBadge /> : null}
              </div>
            </div>
            <MessageClinicButton clinicId={clinic.id} size="lg" className="w-full sm:w-auto" />
          </div>
        </section>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-8">
            <section aria-labelledby="clinic-about">
              <SectionHeader id="clinic-about" title="About" />
              <p className="leading-relaxed text-muted-foreground">
                {clinic.about || "No description provided."}
              </p>
              {clinic.specialtyIds.length ? (
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Specialties">
                  {clinic.specialtyIds.map((id) => (
                    <li
                      key={id}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {specialtyName(id)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section aria-labelledby="clinic-doctors">
              <SectionHeader id="clinic-doctors" title="Doctors" />
              {doctors.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {doctors.map((d) => (
                    <DoctorCard key={d.id} doctor={d} compact />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No doctors are currently listed at this clinic.
                </p>
              )}
            </section>

            {clinic.services.length ? (
              <section aria-labelledby="clinic-services">
                <SectionHeader id="clinic-services" title="Services" />
                <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                  {clinic.services.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {clinic.facilities.length ? (
              <section aria-labelledby="clinic-facilities">
                <SectionHeader id="clinic-facilities" title="Facilities" />
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
                Contact
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
                  {clinic.address}
                </p>
                {clinic.phone ? (
                  <a
                    href={`tel:${clinic.phone.replace(/\s+/g, "")}`}
                    className="flex items-center gap-2 hover:text-foreground"
                  >
                    <Phone className="h-4 w-4 text-foreground" aria-hidden />
                    {clinic.phone}
                  </a>
                ) : null}
                {clinic.email ? (
                  <a
                    href={`mailto:${clinic.email}`}
                    className="flex items-center gap-2 break-all hover:text-foreground"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                    {clinic.email}
                  </a>
                ) : null}
              </div>
            </section>

            <section className="surface-card space-y-3 p-5" aria-labelledby="clinic-hours">
              <h2 id="clinic-hours" className="font-display text-lg font-semibold">
                Opening hours
              </h2>
              {clinic.openingHours.length ? (
                <dl className="space-y-2 text-sm">
                  {clinic.openingHours.map((h) => (
                    <div
                      key={h.day}
                      className="flex justify-between border-b pb-2 last:border-0 last:pb-0"
                    >
                      <dt className="text-muted-foreground">{h.day}</dt>
                      <dd className="text-right font-medium">{h.hours}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Opening hours haven't been listed. Please call the clinic to check.
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </PatientShell>
  );
}
