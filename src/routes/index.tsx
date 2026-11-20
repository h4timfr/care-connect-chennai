import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, CalendarDays, Search, Stethoscope } from "lucide-react";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: pageTitles.home },
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

  const specialties = SPECIALTIES;

  const catalogError = catalog.error ? t(describeDataError(catalog.error)) : null;

  return (
    <PatientShell compact>
      <div className="space-y-5 sm:space-y-6">
        <section
          aria-labelledby="home-heading"
          className="grid items-center gap-4 rounded-2xl border border-primary/15 bg-linear-to-br from-primary-soft via-card to-highlight-soft px-4 py-5 sm:gap-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8"
        >
          <div className="min-w-0">
            <h1
              id="home-heading"
              className="font-display text-2xl leading-tight font-bold tracking-tight text-balance [overflow-wrap:anywhere] sm:text-3xl xl:text-4xl"
            >
              {patient?.name && period
                ? t(`home.greeting.${period}`, { name: patient.name })
                : t("home.title")}
            </h1>
            <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{t("home.subtitle")}</p>
          </div>

          <form
            className="min-w-0"
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
            <div className="flex items-center gap-2 rounded-xl border bg-card p-1.5 ps-3 shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                id="home-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" variant="highlight" className="h-9 shrink-0 px-3 sm:px-4">
                {t("home.search")}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{t("home.searchHint")}</p>
          </form>
        </section>

        {upcoming ? (
          <section
            aria-label={t("home.nextAppointment")}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-primary/20 bg-primary-soft/50 px-4 py-3"
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

        <section aria-labelledby="specialties-heading">
          <SectionHeader
            id="specialties-heading"
            title={t("home.browseBySpecialty")}
            className="mb-2"
          />
          <ul className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-3 sm:grid-cols-5">
            {specialties.map((s) => (
              <li key={s.id}>
                <Link
                  to="/discover"
                  search={{ specialty: s.id }}
                  className="group flex h-full items-center gap-2 rounded-xl border bg-card px-2 py-2 text-start transition-colors hover:border-highlight/40 hover:bg-highlight-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary transition-colors group-hover:bg-highlight-soft group-hover:text-highlight">
                    <SpecialtyIcon icon={s.icon} className="size-4" />
                  </span>
                  <span className="min-w-0 text-xs leading-tight font-medium [overflow-wrap:anywhere]">
                    {fmt.specialty(s.id)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {catalogError ? (
          <ErrorState
            compact
            title={t("home.catalogError")}
            message={catalogError}
            onRetry={catalog.refetch}
          />
        ) : (
          <>
            <div
              className={cn(
                "grid gap-5 sm:gap-6",
                !catalog.isLoading && !doctors.length && !clinics.length && "md:grid-cols-2",
              )}
            >
              <section aria-labelledby="doctors-heading" className="min-w-0">
                <SectionHeader
                  id="doctors-heading"
                  title={t("home.doctorsHeading")}
                  subtitle={t("home.doctorsSubtitle")}
                  className="mb-2.5"
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
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {doctors.slice(0, FEATURED_COUNT).map((d) => (
                      <DoctorCard key={d.id} doctor={d} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={Stethoscope}
                    title={t("home.noDoctorsTitle")}
                    description={t("home.noDoctorsBody")}
                  />
                )}
              </section>

              <section aria-labelledby="clinics-heading" className="min-w-0">
                <SectionHeader
                  id="clinics-heading"
                  title={t("home.clinicsHeading")}
                  subtitle={t("home.clinicsSubtitle")}
                  className="mb-2.5"
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
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {clinics.slice(0, 3).map((c) => (
                      <ClinicCard key={c.id} clinic={c} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={Building2}
                    title={t("home.noClinicsTitle")}
                    description={t("home.noClinicsBody")}
                  />
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </PatientShell>
  );
}
