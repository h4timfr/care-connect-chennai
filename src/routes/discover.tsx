import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, SearchX, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PatientShell } from "@/components/layout/PatientShell";
import { DoctorCard } from "@/components/DoctorCard";
import { ClinicCard } from "@/components/ClinicCard";
import { EmptyState, DemoBanner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { CLINICS, LANGUAGES, SPECIALTIES, clinicById, nextAvailable, slotsForDoctor, specialtyName } from "@/data/mock";
import { addDays, dayPartOf, isoDate } from "@/lib/format";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

interface DiscoverSearch {
  q?: string;
  specialty?: string;
}

export const Route = createFileRoute("/discover")({
  validateSearch: (search: Record<string, unknown>): DiscoverSearch => ({
    q: typeof search["q"] === "string" && search["q"] ? String(search["q"]) : undefined,
    specialty:
      typeof search["specialty"] === "string" && search["specialty"]
        ? String(search["specialty"])
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Find doctors and clinics in Chennai — CareConnect" },
      {
        name: "description",
        content:
          "Search demo doctors by specialty, area, availability, fee, language and experience across Chennai neighbourhoods.",
      },
      { property: "og:title", content: "Find doctors in Chennai — CareConnect" },
      {
        property: "og:description",
        content: "Filter by availability, fee, distance, language and experience.",
      },
    ],
  }),
  component: Discover,
});

type Availability = "any" | "today" | "tomorrow";
type Sort = "availability" | "distance" | "fee";

function Discover() {
  const { q, specialty } = Route.useSearch();
  const navigate = useNavigate();
  const { doctors } = useApp();

  const [text, setText] = useState(q ?? "");
  const [specialtyId, setSpecialtyId] = useState(specialty ?? "");
  const [availability, setAvailability] = useState<Availability>("any");
  const [parts, setParts] = useState<string[]>([]);
  const [maxFee, setMaxFee] = useState(1200);
  const [maxDistance, setMaxDistance] = useState(15);
  const [gender, setGender] = useState<"any" | "male" | "female">("any");
  const [language, setLanguage] = useState("");
  const [minExperience, setMinExperience] = useState(0);
  const [sort, setSort] = useState<Sort>("availability");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setText(q ?? "");
    setSpecialtyId(specialty ?? "");
  }, [q, specialty]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(timer);
  }, [text, specialtyId, availability, parts, maxFee, maxDistance, gender, language, minExperience, sort]);

  const today = isoDate(new Date());
  const tomorrow = isoDate(addDays(new Date(), 1));

  const results = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const filtered = doctors.filter((d) => {
      const clinic = clinicById(d.clinicId);
      if (specialtyId && d.specialtyId !== specialtyId) return false;
      if (needle) {
        const haystack = [
          d.name,
          specialtyName(d.specialtyId),
          clinic?.name ?? "",
          clinic?.area ?? "",
          d.languages.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        const words = needle.split(/\s+/).filter((w) => w.length > 2);
        const matched = words.some((w) => haystack.includes(w));
        if (words.length && !matched) return false;
      }
      if (d.consultationFee > maxFee) return false;
      if (d.distanceKm > maxDistance) return false;
      if (gender !== "any" && d.gender !== gender) return false;
      if (language && !d.languages.includes(language)) return false;
      if (d.experienceYears < minExperience) return false;

      const targetDate =
        availability === "today" ? today : availability === "tomorrow" ? tomorrow : null;
      if (targetDate || parts.length) {
        const dates = targetDate ? [targetDate] : [today, tomorrow];
        const open = dates.flatMap((date) => slotsForDoctor(d.id, date).filter((s) => !s.booked));
        if (!open.length) return false;
        if (parts.length && !open.some((s) => parts.includes(dayPartOf(s.time)))) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === "distance") return a.distanceKm - b.distanceKm;
      if (sort === "fee") return a.consultationFee - b.consultationFee;
      const na = nextAvailable(a.id)?.date ?? "9999";
      const nb = nextAvailable(b.id)?.date ?? "9999";
      return na.localeCompare(nb);
    });
  }, [
    doctors,
    text,
    specialtyId,
    availability,
    parts,
    maxFee,
    maxDistance,
    gender,
    language,
    minExperience,
    sort,
    today,
    tomorrow,
  ]);

  const clinicResults = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return CLINICS.filter((c) => {
      if (specialtyId && !c.specialtyIds.includes(specialtyId)) return false;
      if (!needle) return true;
      return `${c.name} ${c.area} ${c.services.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [text, specialtyId]);

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
    );

  const resetFilters = () => {
    setAvailability("any");
    setParts([]);
    setMaxFee(1200);
    setMaxDistance(15);
    setGender("any");
    setLanguage("");
    setMinExperience(0);
    setSpecialtyId("");
  };

  return (
    <PatientShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Find doctors</h1>
          <p className="text-sm text-muted-foreground">
            Search demo providers by specialty, clinic, area or doctor name.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/discover", search: { q: text, specialty: specialtyId || undefined } });
          }}
          className="surface-card flex items-center gap-2 p-2 pl-4"
        >
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <label htmlFor="discover-search" className="sr-only">
            Search doctors and clinics
          </label>
          <input
            id="discover-search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pediatrician near Adyar, Dr. Rao, Little Steps Clinic…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 lg:hidden"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
          </Button>
        </form>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" className={chip(!specialtyId)} onClick={() => setSpecialtyId("")}>
            All specialties
          </button>
          {SPECIALTIES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cn(chip(specialtyId === s.id), "shrink-0")}
              onClick={() => setSpecialtyId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside
            className={cn(
              "surface-card h-fit space-y-5 p-4 lg:sticky lg:top-24 lg:block",
              showFilters ? "block" : "hidden",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Filters</h2>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Reset
              </Button>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Availability
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["any", "today", "tomorrow"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={chip(availability === a)}
                    onClick={() => setAvailability(a)}
                  >
                    {a === "any" ? "Any day" : a === "today" ? "Available today" : "Tomorrow"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Time of day
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {["morning", "afternoon", "evening"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={chip(parts.includes(p))}
                    onClick={() =>
                      setParts((prev) =>
                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                      )
                    }
                  >
                    {p[0]!.toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Consultation fee up to ₹{maxFee}
              </Label>
              <Slider
                className="mt-3"
                min={300}
                max={1200}
                step={50}
                value={[maxFee]}
                onValueChange={([v]) => setMaxFee(v ?? 1200)}
              />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Distance up to {maxDistance} km
              </Label>
              <Slider
                className="mt-3"
                min={1}
                max={15}
                step={1}
                value={[maxDistance]}
                onValueChange={([v]) => setMaxDistance(v ?? 15)}
              />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Gender</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["any", "female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={chip(gender === g)}
                    onClick={() => setGender(g)}
                  >
                    {g === "any" ? "Any" : g[0]!.toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Language
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={chip(!language)} onClick={() => setLanguage("")}>
                  Any
                </button>
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={chip(language === l)}
                    onClick={() => setLanguage(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Minimum experience: {minExperience} yrs
              </Label>
              <Slider
                className="mt-3"
                min={0}
                max={20}
                step={1}
                value={[minExperience]}
                onValueChange={([v]) => setMinExperience(v ?? 0)}
              />
            </div>
          </aside>

          <div className="min-w-0">
            <Tabs defaultValue="doctors">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <TabsList>
                  <TabsTrigger value="doctors">Doctors</TabsTrigger>
                  <TabsTrigger value="clinics">Clinics</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2">
                  <label htmlFor="sort" className="hidden text-xs text-muted-foreground sm:block">
                    Sort by
                  </label>
                  <select
                    id="sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    className="rounded-lg border bg-card px-2.5 py-1.5 text-xs"
                  >
                    <option value="availability">Earliest availability</option>
                    <option value="distance">Distance</option>
                    <option value="fee">Consultation fee</option>
                  </select>
                </div>
              </div>

              <TabsContent value="doctors" className="mt-4">
                {loading ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="surface-card space-y-3 p-5">
                        <div className="flex gap-3">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                        <Skeleton className="h-16 w-full" />
                      </div>
                    ))}
                  </div>
                ) : results.length ? (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">
                      {results.length} doctors match your filters. Results are ordered by your
                      chosen sort, not by any quality ranking.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {results.map((d) => (
                        <DoctorCard key={d.id} doctor={d} />
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={SearchX}
                    title="No doctors match these filters"
                    description="Try widening the fee or distance range, or clearing the availability filter."
                    action={
                      <Button variant="outline" size="sm" onClick={resetFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                )}
              </TabsContent>

              <TabsContent value="clinics" className="mt-4">
                {clinicResults.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {clinicResults.map((c) => (
                      <ClinicCard key={c.id} clinic={c} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={SearchX}
                    title="No clinics found"
                    description="Try another area, specialty or clinic name."
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DemoBanner />
      </div>
    </PatientShell>
  );
}
