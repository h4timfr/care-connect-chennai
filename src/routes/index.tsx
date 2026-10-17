import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { PatientShell } from "@/components/layout/PatientShell";
import { DoctorCard } from "@/components/DoctorCard";
import { ClinicCard } from "@/components/ClinicCard";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  SectionHeader,
  SpecialtyIcon,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { SPECIALTIES, isoDate } from "@/lib/format";
import { useApp } from "@/lib/store";
import { describeDataError } from "@/lib/supabase/errors";
import { useI18n } from "@/lib/i18n";
import { useDayPeriod } from "@/hooks/useDayPeriod";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareConnect — Find doctors and book clinic appointments in Chennai" },
      {
        name: "description",
        content:
          "Search doctors and clinics across Chennai by specialty, area or name, and book an appointment online.",
      },
    ],
  }),
  component: Home,
});

const FEATURED_COUNT = 6;

function Home() {
  const { patient, patientAppointments, doctors, clinics, catalog, doctorById, clinicById } =
    useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { t, fmt } = useI18n();
  // The viewer's local time of day (their own time zone, not the clinic's).
  const period = useDayPeriod();

  const upcoming = useMemo(() => {
    const today = isoDate(new Date());
    return patientAppointments
      .filter((a) => (a.status === "confirmed" || a.status === "pending") && a.date >= today)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  }, [patientAppointments]);

  // Only offer specialties that at least one listed doctor actually practises.
  const specialties = useMemo(() => {
    const present = new Set(doctors.map((d) => d.specialtyId));
    return SPECIALTIES.filter((s) => present.has(s.id));
  }, [doctors]);

  const catalogError = catalog.error ? t(describeDataError(catalog.error)) : null;

  return (
    <PatientShell>
      <div className="space-y-10">
        <section
          aria-labelledby="home-heading"
          className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary-soft via-card to-highlight-soft px-5 py-7 sm:px-8 sm:py-10"
        >
          <h1
            id="home-heading"
            className="font-display text-2xl font-bold [overflow-wrap:anywhere] sm:text-4xl"
          >
            {patient?.name && period
              ? t(`home.greeting.${period}`, { name: patient.name })
              : t("home.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {t("home.subtitle")}
          </p>

          <form
            className="mt-5"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              navigate({ to: "/discover", search: q ? { q } : {} });
            }}
          >
            <label htmlFor="home-search" className="sr-only">
              {t("home.searchLabel")}
            </label>
            <div className="surface-raised flex max-w-3xl items-center gap-2 p-2 ps-4 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                id="home-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" variant="highlight" className="shrink-0">
                {t("home.search")}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("home.searchHint")}</p>
          </form>
        </section>

        {upcoming ? (
          <section
            aria-label={t("home.nextAppointment")}
            className="surface-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-primary/25 bg-primary-soft/50 p-4 sm:p-5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {t("home.nextAppointment")}
              </p>
              <p className="mt-1 truncate font-display font-semibold">
                {doctorById(upcoming.doctorId)?.name ?? t("home.yourDoctor")}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {fmt.longDate(upcoming.date)} · {fmt.time(upcoming.time)}
                {clinicById(upcoming.clinicId) ? ` · ${clinicById(upcoming.clinicId)?.name}` : ""}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/appointments/$appointmentId" params={{ appointmentId: upcoming.id }}>
                {t("common.view")}
              </Link>
            </Button>
          </section>
        ) : null}

        {catalogError ? (
          <ErrorState
            title={t("home.catalogError")}
            message={catalogError}
            onRetry={catalog.refetch}
          />
        ) : (
          <>
            <section aria-labelledby="specialties-heading">
              <SectionHeader id="specialties-heading" title={t("home.browseBySpecialty")} />
              {catalog.isLoading ? (
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="surface-card h-[92px] animate-pulse" />
                  ))}
                </div>
              ) : specialties.length ? (
                <ul className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-3 sm:grid-cols-5">
                  {specialties.map((s) => (
                    <li key={s.id}>
                      <Link
                        to="/discover"
                        search={{ specialty: s.id }}
                        className="surface-card group flex h-full flex-col items-center gap-2 px-2 py-4 text-center transition-[border-color,box-shadow] hover:border-highlight/40 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary transition-colors group-hover:bg-highlight-soft group-hover:text-highlight">
                          <SpecialtyIcon icon={s.icon} />
                        </span>
                        <span className="text-xs font-medium leading-tight">
                          {fmt.specialty(s.id)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("home.noSpecialties")}</p>
              )}
            </section>

            <section aria-labelledby="doctors-heading">
              <SectionHeader
                id="doctors-heading"
                title={t("home.doctorsHeading")}
                subtitle={t("home.doctorsSubtitle")}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/discover">
                      {t("common.seeAll")}{" "}
                      <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                    </Link>
                  </Button>
                }
              />
              {catalog.isLoading ? (
                <CardGridSkeleton count={4} label={t("home.loadingDoctors")} />
              ) : doctors.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {doctors.slice(0, FEATURED_COUNT).map((d) => (
                    <DoctorCard key={d.id} doctor={d} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={SearchX}
                  title={t("home.noDoctorsTitle")}
                  description={t("home.noDoctorsBody")}
                />
              )}
            </section>

            <section aria-labelledby="clinics-heading">
              <SectionHeader
                id="clinics-heading"
                title={t("home.clinicsHeading")}
                subtitle={t("home.clinicsSubtitle")}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/discover" search={{ tab: "clinics" }}>
                      {t("common.seeAll")}{" "}
                      <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                    </Link>
                  </Button>
                }
              />
              {catalog.isLoading ? (
                <CardGridSkeleton count={2} label={t("home.loadingClinics")} />
              ) : clinics.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {clinics.slice(0, 3).map((c) => (
                    <ClinicCard key={c.id} clinic={c} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={SearchX}
                  title={t("home.noClinicsTitle")}
                  description={t("home.noClinicsBody")}
                />
              )}
            </section>
          </>
        )}
      </div>
    </PatientShell>
  );
}
