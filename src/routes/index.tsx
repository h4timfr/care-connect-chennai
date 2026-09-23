import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { PatientShell } from "@/components/layout/PatientShell";
import { DoctorCard } from "@/components/DoctorCard";
import { ClinicCard } from "@/components/ClinicCard";
import { DemoBanner, SectionHeader, SpecialtyIcon } from "@/components/common";
import { Button } from "@/components/ui/button";
import { SPECIALTIES } from "@/lib/format";
import { useApp } from "@/lib/store";
import { longDate, to12h } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareConnect — Find and book Chennai clinic appointments" },
      {
        name: "description",
        content:
          "Discover independent doctors and clinics across Chennai, see live demo availability and book an appointment in a few taps.",
      },
      { property: "og:title", content: "CareConnect — Chennai clinic appointments" },
      {
        property: "og:description",
        content: "Discover, book and message independent Chennai clinics from one app.",
      },
    ],
  }),
  component: Home,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Home() {
  const { patient, patientAppointments: appointments, doctors, clinics } = useApp();
  
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const upcoming = appointments
    .filter(
      (a) =>
        a.patientId === patient?.id &&
        (a.status === "confirmed" || a.status === "pending") &&
        a.date >= new Date().toISOString().slice(0, 10),
    )
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  const upcomingDoctor = upcoming ? doctors.find(d => d.id === upcoming.doctorId) : undefined;

  const nearYou = doctors
    .slice()
    .slice(0, 6);

  return (
    <PatientShell>
      <div className="space-y-10">
        <section>
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{patient?.name ?? "Welcome!"}</h1>

          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/discover", search: { q: query } });
            }}
          >
            <label htmlFor="home-search" className="sr-only">
              What are you looking for?
            </label>
            <div className="surface-card flex items-center gap-2 p-2 pl-4">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                id="home-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What are you looking for?"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="sm" className="shrink-0">
                Search
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Try “Find a pediatrician near Adyar tomorrow evening” or search by doctor, clinic or
              area.
            </p>
          </form>
        </section>

        {upcoming ? (
          <section className="surface-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-primary/25 bg-primary-soft/50 p-4 sm:p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Next appointment
              </p>
              <p className="mt-1 truncate font-display font-semibold">{upcomingDoctor?.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {longDate(upcoming.date)} · {to12h(upcoming.time)}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/appointments">View</Link>
            </Button>
          </section>
        ) : null}

        <section>
          <SectionHeader title="Browse by specialty" />
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {SPECIALTIES.map((s: {id: string, name: string, icon: string}) => (
              <Link
                key={s.id}
                to="/discover"
                search={{ specialty: s.id }}
                className="surface-card flex flex-col items-center gap-2 px-2 py-4 text-center transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
                  <SpecialtyIcon icon={s.icon} />
                </span>
                <span className="text-xs font-medium leading-tight">{s.name}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader
            title="Near you"
            subtitle={`Doctors consulting close to ${patient?.area ?? "you"}`}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/discover" search={{}}>
                  See all <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            }
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {nearYou.map((d) => (
              <DoctorCard key={d.id} doctor={d} />
            ))}
          </div>
        </section>

        <section className="surface-card grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-display font-semibold">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              Ask the appointment assistant
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Describe what you need in plain language and get matching clinics and slots. It helps
              with booking logistics only — not medical advice.
            </p>
          </div>
          <Button asChild>
            <Link to="/assistant">Open assistant</Link>
          </Button>
        </section>

        <section>
          <SectionHeader
            title="Clinics in your city"
            subtitle="Independent clinics across Chennai"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clinics.slice(0, 3).map((c) => (
              <ClinicCard key={c.id} clinic={c} />
            ))}
          </div>
        </section>

        <DemoBanner />
      </div>
    </PatientShell>
  );
}


