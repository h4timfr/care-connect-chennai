import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, CalendarDays, LayoutGrid, Search, Stethoscope } from "lucide-react";
import { useMemo } from "react";
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

const PREVIEW_COUNT = 3;
const SPECIALTY_ACCENTS: Record<string, string> = {
  cardiology: "bg-highlight-soft text-highlight",
  dermatology: "bg-warning/15 text-warning-foreground dark:text-warning",
  ent: "bg-info/15 text-info",
  gynecology: "bg-highlight-soft text-highlight",
  neurology: "bg-highlight-soft text-highlight",
  ophthalmology: "bg-info/15 text-info",
  pediatrics: "bg-warning/15 text-warning-foreground dark:text-warning",
  psychiatry: "bg-highlight-soft text-highlight",
};
const SPECIALTY_LINK =
  "flex h-full min-h-12 items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 text-start text-[0.8125rem] leading-snug font-medium [overflow-wrap:anywhere] transition-colors hover:border-primary/45 hover:bg-primary-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none max-[399px]:flex-col max-[399px]:items-start sm:gap-2 sm:px-3 sm:text-sm";

function Home() {
  const { patient, patientAppointments, doctors, clinics, catalog, doctorById, clinicById } =
    useApp();
  const navigate = useNavigate();
  const { t, fmt } = useI18n();
  // The viewer's local time of day (their own time zone, not the clinic's).
  const period = useDayPeriod();

  const upcoming = useMemo(() => {
    const today = isoDate(new Date());
    return patientAppointments
      .filter((a) => (a.status === "confirmed" || a.status === "pending") && a.date >= today)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  }, [patientAppointments]);

  const catalogError = catalog.error ? t(describeDataError(catalog.error)) : null;

  return (
    <PatientShell compact>
      <div className="space-y-5 sm:space-y-6">
        <section
          aria-labelledby="home-heading"
          className="surface-card grid items-center gap-2 border-s-4 border-s-primary px-3 py-2 sm:gap-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8"
        >
          <div className="min-w-0">
            <h1 id="home-heading" className="page-title">
              {patient?.name && period
                ? t(`home.greeting.${period}`, { name: patient.name })
                : t("home.title")}
            </h1>
            <p className="page-description mt-1.5">{t("home.subtitle")}</p>
          </div>

          <form
            className="min-w-0"
            role="search"
            action="/discover"
            onSubmit={(e) => {
              e.preventDefault();
              const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
              navigate({ to: "/discover", search: q ? { q } : {} });
            }}
          >
            <label htmlFor="home-search" className="sr-only">
              {t("home.searchLabel")}
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-background p-1 ps-2.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 sm:p-1.5 sm:ps-3">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                id="home-search"
                name="q"
                type="search"
                aria-describedby="home-search-hint"
                placeholder={t("home.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
              />
              <Button type="submit" className="h-9 shrink-0 px-3 sm:px-4">
                {t("home.search")}
              </Button>
            </div>
            <p
              id="home-search-hint"
              className="mt-1.5 text-xs text-muted-foreground max-[359px]:sr-only"
            >
              {t("home.searchHint")}
            </p>
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

        <section
          aria-labelledby="specialties-heading"
          className="rounded-2xl border bg-card/65 p-3 sm:p-4"
        >
          <SectionHeader
            id="specialties-heading"
            title={t("home.browseBySpecialty")}
            className="mb-3"
          />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {SPECIALTIES.map((s) => (
              <li key={s.id} className="min-w-0">
                <Link to="/discover" search={{ specialty: s.id }} className={SPECIALTY_LINK}>
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md sm:size-8",
                      SPECIALTY_ACCENTS[s.id] ?? "bg-primary-soft text-primary",
                    )}
                  >
                    <SpecialtyIcon icon={s.icon} className="size-4" />
                  </span>
                  <span className="min-w-0">{fmt.specialty(s.id)}</span>
                </Link>
              </li>
            ))}
            <li className="min-w-0">
              <Link
                to="/discover"
                className={cn(SPECIALTY_LINK, "border-primary/25 bg-primary-soft/35 text-primary")}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-soft sm:size-8">
                  <LayoutGrid className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">{t("discover.allSpecialties")}</span>
              </Link>
            </li>
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
            <div className="grid items-start gap-5 md:grid-cols-2 md:gap-6">
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
                  <CardGridSkeleton count={1} label={t("home.loadingDoctors")} />
                ) : doctors.length ? (
                  <div className="grid gap-3">
                    {doctors.slice(0, PREVIEW_COUNT).map((d) => (
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
                  <CardGridSkeleton count={1} label={t("home.loadingClinics")} />
                ) : clinics.length ? (
                  <div className="grid gap-3">
                    {clinics.slice(0, PREVIEW_COUNT).map((c) => (
                      <ClinicCard key={c.id} clinic={c} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    tone="highlight"
                    icon={Building2}
                    title={t("home.noClinicsTitle")}
                    description={t("home.noClinicsBody")}
                  />
                )}
              </section>
            </div>
          </>
        )}
        <section
          aria-labelledby="clinic-onboarding-heading"
          className="grid items-center gap-3 rounded-xl border bg-primary-soft/40 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5"
        >
          <div className="min-w-0">
            <h2 id="clinic-onboarding-heading" className="section-title">
              {t("providers.eyebrow")}
            </h2>
            <p className="page-description mt-1">{t("providers.howBody")}</p>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-9 max-w-full whitespace-normal justify-self-start py-2 text-start"
          >
            <Link to="/providers/apply">
              {t("providers.apply")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        </section>
      </div>
    </PatientShell>
  );
}
