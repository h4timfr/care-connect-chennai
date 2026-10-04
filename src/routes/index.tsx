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
import { SPECIALTIES, isoDate, longDate, to12h } from "@/lib/format";
import { useApp } from "@/lib/store";
import { describeDataError } from "@/lib/supabase/errors";

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

/** Greeting by the hour in India, so server-rendered and client-rendered output agree. */
function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const FEATURED_COUNT = 6;

function Home() {
  const { patient, patientAppointments, doctors, clinics, catalog, doctorById, clinicById } =
    useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

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

  const catalogError = catalog.error ? describeDataError(catalog.error) : null;

  return (
    <PatientShell>
      <div className="space-y-10">
        <section aria-labelledby="home-heading">
          <h1 id="home-heading" className="font-display text-2xl font-bold sm:text-3xl">
            {patient?.name ? `${greeting()}, ${patient.name}` : "Find a doctor in Chennai"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search clinics and doctors, book appointments and message your clinic.
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
              Search doctors and clinics
            </label>
            <div className="surface-card flex items-center gap-2 p-2 pl-4 focus-within:ring-2 focus-within:ring-ring">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                id="home-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Specialty, doctor, clinic or area"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="sm" className="shrink-0">
                Search
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Try “pediatrician Adyar”, a doctor's name or a clinic name.
            </p>
          </form>
        </section>

        {upcoming ? (
          <section
            aria-label="Next appointment"
            className="surface-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-primary/25 bg-primary-soft/50 p-4 sm:p-5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Next appointment
              </p>
              <p className="mt-1 truncate font-display font-semibold">
                {doctorById(upcoming.doctorId)?.name ?? "Your doctor"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {longDate(upcoming.date)} · {to12h(upcoming.time)}
                {clinicById(upcoming.clinicId) ? ` · ${clinicById(upcoming.clinicId)?.name}` : ""}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/appointments/$appointmentId" params={{ appointmentId: upcoming.id }}>
                View
              </Link>
            </Button>
          </section>
        ) : null}

        {catalogError ? (
          <ErrorState
            title="We couldn't load doctors and clinics"
            message={catalogError}
            onRetry={catalog.refetch}
          />
        ) : (
          <>
            <section aria-labelledby="specialties-heading">
              <SectionHeader id="specialties-heading" title="Browse by specialty" />
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
                        className="surface-card flex h-full flex-col items-center gap-2 px-2 py-4 text-center transition-colors hover:border-primary/40 hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
                          <SpecialtyIcon icon={s.icon} />
                        </span>
                        <span className="text-xs font-medium leading-tight">{s.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No specialties are listed yet.</p>
              )}
            </section>

            <section aria-labelledby="doctors-heading">
              <SectionHeader
                id="doctors-heading"
                title="Doctors on CareConnect"
                subtitle="Listed alphabetically"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/discover">
                      See all <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                }
              />
              {catalog.isLoading ? (
                <CardGridSkeleton count={4} label="Loading doctors" />
              ) : doctors.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {doctors.slice(0, FEATURED_COUNT).map((d) => (
                    <DoctorCard key={d.id} doctor={d} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={SearchX}
                  title="No doctors listed yet"
                  description="Doctors will appear here once clinics add them to CareConnect."
                />
              )}
            </section>

            <section aria-labelledby="clinics-heading">
              <SectionHeader
                id="clinics-heading"
                title="Clinics"
                subtitle="Independent clinics across Chennai"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/discover" search={{ tab: "clinics" }}>
                      See all <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                }
              />
              {catalog.isLoading ? (
                <CardGridSkeleton count={2} label="Loading clinics" />
              ) : clinics.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {clinics.slice(0, 3).map((c) => (
                    <ClinicCard key={c.id} clinic={c} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={SearchX}
                  title="No clinics listed yet"
                  description="Clinics will appear here once they join CareConnect."
                />
              )}
            </section>
          </>
        )}
      </div>
    </PatientShell>
  );
}
