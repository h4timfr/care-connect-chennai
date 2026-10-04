import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PatientShell } from "@/components/layout/PatientShell";
import { DoctorCard } from "@/components/DoctorCard";
import { ClinicCard } from "@/components/ClinicCard";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { SPECIALTIES, inr } from "@/lib/format";
import { useApp } from "@/lib/store";
import {
  SEARCH_RESULT_LIMIT,
  useClinicSearch,
  useDoctorSearch,
  type DoctorFilters,
  type DoctorSort,
} from "@/lib/supabase/queries";
import { describeDataError } from "@/lib/supabase/errors";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

type DiscoverTab = "doctors" | "clinics";

interface DiscoverSearch {
  q?: string;
  specialty?: string;
  tab?: DiscoverTab;
}

export const Route = createFileRoute("/discover")({
  validateSearch: ({ q, specialty, tab }: Record<string, unknown>): DiscoverSearch => {
    const params: DiscoverSearch = {};
    if (typeof q === "string" && q.trim()) params.q = q.trim().slice(0, 100);
    if (typeof specialty === "string" && specialty) params.specialty = specialty;
    if (tab === "clinics") params.tab = "clinics";
    return params;
  },
  head: () => ({
    meta: [
      { title: "Find doctors and clinics in Chennai — CareConnect" },
      {
        name: "description",
        content:
          "Search Chennai doctors and clinics by specialty, area, fee, language and experience.",
      },
    ],
  }),
  component: Discover,
});

const SEARCH_DEBOUNCE_MS = 300;

/** Returns `prev` with `key` set, or removed when the value is empty, keeping URLs tidy. */
function withParam<K extends keyof DiscoverSearch>(
  prev: DiscoverSearch,
  key: K,
  value: DiscoverSearch[K] | undefined,
): DiscoverSearch {
  const next = { ...prev };
  if (value === undefined || value === "") delete next[key];
  else next[key] = value;
  return next;
}
const FEE_STEP = 100;

const SORT_OPTIONS: { value: DoctorSort; label: string }[] = [
  { value: "name", label: "Name (A–Z)" },
  { value: "fee_asc", label: "Fee: low to high" },
  { value: "fee_desc", label: "Fee: high to low" },
  { value: "experience", label: "Most experienced" },
];

function Discover() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/discover" });
  const { doctors: catalogDoctors, clinics: catalogClinics } = useApp();

  const [text, setText] = useState(search.q ?? "");
  const debouncedText = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const specialtyId = search.specialty ?? "";
  const tab: DiscoverTab = search.tab ?? "doctors";

  const [gender, setGender] = useState<DoctorFilters["gender"]>("any");
  const [language, setLanguage] = useState("");
  const [maxFee, setMaxFee] = useState<number | null>(null);
  const [minExperience, setMinExperience] = useState(0);
  const [sort, setSort] = useState<DoctorSort>("name");
  const [showFilters, setShowFilters] = useState(false);

  // Keep ?q= shareable without fighting the input while the user is typing.
  const lastSyncedQ = useRef(search.q ?? "");
  useEffect(() => {
    const q = search.q ?? "";
    if (q !== lastSyncedQ.current) {
      lastSyncedQ.current = q;
      setText(q);
    }
  }, [search.q]);
  useEffect(() => {
    if (debouncedText === lastSyncedQ.current) return;
    lastSyncedQ.current = debouncedText;
    navigate({
      search: (prev) => withParam(prev, "q", debouncedText),
      replace: true,
    });
  }, [debouncedText, navigate]);

  // Filter options come from the listed data, so every option can return results.
  const specialtyOptions = useMemo(() => {
    const present = new Set([
      ...catalogDoctors.map((d) => d.specialtyId),
      ...catalogClinics.flatMap((c) => c.specialtyIds),
    ]);
    return SPECIALTIES.filter((s) => present.has(s.id));
  }, [catalogDoctors, catalogClinics]);

  const languageOptions = useMemo(
    () => [...new Set(catalogDoctors.flatMap((d) => d.languages))].sort(),
    [catalogDoctors],
  );

  const feeBounds = useMemo(() => {
    const fees = catalogDoctors.map((d) => d.consultationFee).filter((f) => f > 0);
    if (!fees.length) return null;
    const min = Math.floor(Math.min(...fees) / FEE_STEP) * FEE_STEP;
    const max = Math.ceil(Math.max(...fees) / FEE_STEP) * FEE_STEP;
    return min < max ? { min, max } : null;
  }, [catalogDoctors]);

  const maxExperienceOption = useMemo(
    () => Math.max(0, ...catalogDoctors.map((d) => d.experienceYears)),
    [catalogDoctors],
  );

  const doctorFilters: DoctorFilters = {
    text: debouncedText,
    specialtyId,
    gender,
    language,
    maxFee,
    minExperience,
    sort,
  };
  const doctorsQuery = useDoctorSearch(doctorFilters);
  const clinicsQuery = useClinicSearch({ text: debouncedText, specialtyId });

  const setSpecialty = (id: string) =>
    navigate({ search: (prev) => withParam(prev, "specialty", id), replace: true });
  const setTab = (value: string) =>
    navigate({
      search: (prev) => withParam(prev, "tab", value === "clinics" ? "clinics" : undefined),
      replace: true,
    });

  const activeFilterCount =
    (gender !== "any" ? 1 : 0) +
    (language ? 1 : 0) +
    (maxFee !== null ? 1 : 0) +
    (minExperience > 0 ? 1 : 0);
  const hasAnyCriteria = activeFilterCount > 0 || !!specialtyId || !!debouncedText;

  const resetFilters = () => {
    setGender("any");
    setLanguage("");
    setMaxFee(null);
    setMinExperience(0);
  };
  const clearEverything = () => {
    resetFilters();
    setText("");
    lastSyncedQ.current = "";
    navigate({ search: (prev) => withParam({}, "tab", prev.tab), replace: true });
  };

  const chip = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
    );

  const doctors = doctorsQuery.data;
  const clinics = clinicsQuery.data;
  const updating =
    (doctorsQuery.isFetching && doctorsQuery.isPlaceholderData) ||
    (clinicsQuery.isFetching && clinicsQuery.isPlaceholderData) ||
    text.trim() !== debouncedText;

  return (
    <PatientShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Find doctors</h1>
          <p className="text-sm text-muted-foreground">
            Search providers by specialty, clinic, area or doctor name.
          </p>
        </div>

        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="surface-card flex items-center gap-2 p-2 pl-4 focus-within:ring-2 focus-within:ring-ring"
        >
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <label htmlFor="discover-search" className="sr-only">
            Search doctors and clinics
          </label>
          <input
            id="discover-search"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pediatrician Adyar, Dr. Rao, Little Steps Clinic…"
            maxLength={100}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {text ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setText("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 lg:hidden"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="discover-filters"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {activeFilterCount ? ` (${activeFilterCount})` : ""}
          </Button>
        </form>

        {specialtyOptions.length ? (
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label="Specialty"
          >
            <button
              type="button"
              className={chip(!specialtyId)}
              aria-pressed={!specialtyId}
              onClick={() => setSpecialty("")}
            >
              All specialties
            </button>
            {specialtyOptions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={chip(specialtyId === s.id)}
                aria-pressed={specialtyId === s.id}
                onClick={() => setSpecialty(specialtyId === s.id ? "" : s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside
            id="discover-filters"
            aria-label="Doctor filters"
            className={cn(
              "surface-card h-fit space-y-5 p-4 lg:sticky lg:top-24 lg:block",
              showFilters ? "block" : "hidden",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Filters</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
              >
                Reset
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">These filters apply to doctors.</p>

            {feeBounds ? (
              <FilterGroup
                label={
                  maxFee === null
                    ? "Consultation fee: any"
                    : `Consultation fee up to ${inr(maxFee)}`
                }
                id="fee-filter"
              >
                <Slider
                  aria-labelledby="fee-filter"
                  thumbLabel="Maximum consultation fee"
                  valueText={maxFee === null ? "Any fee" : `Up to ${inr(maxFee)}`}
                  className="mt-3"
                  min={feeBounds.min}
                  max={feeBounds.max}
                  step={FEE_STEP}
                  value={[maxFee ?? feeBounds.max]}
                  onValueChange={([v]) =>
                    setMaxFee(v === undefined || v >= feeBounds.max ? null : v)
                  }
                />
              </FilterGroup>
            ) : null}

            {maxExperienceOption > 0 ? (
              <FilterGroup
                label={
                  minExperience > 0
                    ? `Minimum experience: ${minExperience} yrs`
                    : "Minimum experience: any"
                }
                id="experience-filter"
              >
                <Slider
                  aria-labelledby="experience-filter"
                  thumbLabel="Minimum years of experience"
                  valueText={minExperience > 0 ? `${minExperience} years or more` : "Any"}
                  className="mt-3"
                  min={0}
                  max={maxExperienceOption}
                  step={1}
                  value={[minExperience]}
                  onValueChange={([v]) => setMinExperience(v ?? 0)}
                />
              </FilterGroup>
            ) : null}

            <FilterGroup label="Doctor's gender" id="gender-filter">
              <div
                className="mt-2 flex flex-wrap gap-2"
                role="group"
                aria-labelledby="gender-filter"
              >
                {(["any", "female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={chip(gender === g)}
                    aria-pressed={gender === g}
                    onClick={() => setGender(g)}
                  >
                    {g === "any" ? "Any" : g === "female" ? "Female" : "Male"}
                  </button>
                ))}
              </div>
            </FilterGroup>

            {languageOptions.length ? (
              <FilterGroup label="Language spoken" id="language-filter">
                <div
                  className="mt-2 flex flex-wrap gap-2"
                  role="group"
                  aria-labelledby="language-filter"
                >
                  <button
                    type="button"
                    className={chip(!language)}
                    aria-pressed={!language}
                    onClick={() => setLanguage("")}
                  >
                    Any
                  </button>
                  {languageOptions.map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={chip(language === l)}
                      aria-pressed={language === l}
                      onClick={() => setLanguage(language === l ? "" : l)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </FilterGroup>
            ) : null}
          </aside>

          <div className="min-w-0">
            <Tabs value={tab} onValueChange={setTab}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="doctors">
                    Doctors{doctors ? ` (${doctors.length})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="clinics">
                    Clinics{clinics ? ` (${clinics.length})` : ""}
                  </TabsTrigger>
                </TabsList>
                {tab === "doctors" ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor="sort" className="text-xs text-muted-foreground">
                      Sort by
                    </label>
                    <select
                      id="sort"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as DoctorSort)}
                      className="rounded-lg border bg-card px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <p
                className="mt-3 flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground"
                aria-live="polite"
              >
                {updating ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Updating results…
                  </>
                ) : null}
              </p>

              <TabsContent value="doctors" className="mt-1">
                <ResultsState
                  query={doctorsQuery}
                  noun="doctors"
                  loadingLabel="Loading doctors"
                  emptyTitle="No matching doctors"
                  emptyDescription={
                    hasAnyCriteria
                      ? "No doctors match your search and filters. Try a different search or clear the filters."
                      : "No doctors are listed on CareConnect yet."
                  }
                  onClear={hasAnyCriteria ? clearEverything : undefined}
                >
                  {(list) => (
                    <>
                      <p className="mb-3 text-sm text-muted-foreground">
                        {list.length}{" "}
                        {hasAnyCriteria
                          ? list.length === 1
                            ? "doctor matches your search"
                            : "doctors match your search"
                          : list.length === 1
                            ? "doctor listed"
                            : "doctors listed"}
                        .
                        {list.length >= SEARCH_RESULT_LIMIT
                          ? ` Showing the first ${SEARCH_RESULT_LIMIT} — refine your search to narrow it down.`
                          : ""}
                      </p>
                      <div className="grid gap-4 md:grid-cols-2">
                        {list.map((d) => (
                          <DoctorCard key={d.id} doctor={d} />
                        ))}
                      </div>
                    </>
                  )}
                </ResultsState>
              </TabsContent>

              <TabsContent value="clinics" className="mt-1">
                <ResultsState
                  query={clinicsQuery}
                  noun="clinics"
                  loadingLabel="Loading clinics"
                  emptyTitle="No matching clinics"
                  emptyDescription={
                    debouncedText || specialtyId
                      ? "No clinics match your search. Try another area, specialty or clinic name."
                      : "No clinics are listed on CareConnect yet."
                  }
                  onClear={debouncedText || specialtyId ? clearEverything : undefined}
                >
                  {(list) => (
                    <div className="grid gap-4 md:grid-cols-2">
                      {list.map((c) => (
                        <ClinicCard key={c.id} clinic={c} />
                      ))}
                    </div>
                  )}
                </ResultsState>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PatientShell>
  );
}

function FilterGroup({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <p id={id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function ResultsState<T>({
  query,
  noun,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  onClear,
  children,
}: {
  query: { data: T[] | undefined; error: Error | null; isPending: boolean; refetch: () => unknown };
  noun: string;
  loadingLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  onClear: (() => void) | undefined;
  children: (list: T[]) => ReactNode;
}) {
  // An error always wins: never show results from a previous search as if they matched this one.
  if (query.error) {
    return (
      <ErrorState
        title={`We couldn't load ${noun}`}
        message={describeDataError(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isPending || !query.data) return <CardGridSkeleton label={loadingLabel} />;
  if (!query.data.length) {
    return (
      <EmptyState
        icon={SearchX}
        title={emptyTitle}
        description={emptyDescription}
        action={
          onClear ? (
            <Button variant="outline" size="sm" onClick={onClear}>
              Clear search and filters
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <>{children(query.data)}</>;
}
