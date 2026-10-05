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
import { SPECIALTIES, specialtyInfo } from "@/lib/format";
import { useApp } from "@/lib/store";
import {
  SEARCH_RESULT_LIMIT,
  hasClinicCriteria,
  hasDoctorCriteria,
  unfilteredClinics,
  unfilteredDoctors,
  useClinicSearch,
  useDoctorSearch,
  type ClinicFilters,
  type DoctorFilters,
  type DoctorSort,
} from "@/lib/supabase/queries";
import type { Clinic, Doctor } from "@/lib/types";
import { describeDataError } from "@/lib/supabase/errors";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

type DiscoverTab = "doctors" | "clinics";

interface DiscoverSearch {
  q?: string | undefined;
  specialty?: string | undefined;
  tab?: DiscoverTab | undefined;
  gender?: "female" | "male" | undefined;
  lang?: string | undefined;
  /** Maximum consultation fee (₹). */
  fee?: number | undefined;
  /** Minimum years of experience. */
  exp?: number | undefined;
  sort?: Exclude<DoctorSort, "name"> | undefined;
}

const SORT_VALUES: DoctorSort[] = ["name", "fee_asc", "fee_desc", "experience"];

/** A whole number within [min, max] from a URL value, or undefined. */
function boundedInt(value: unknown, min: number, max: number) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

export const Route = createFileRoute("/discover")({
  // Every filter lives in the URL so refreshes, shared links and history keep it.
  // TanStack Router merges validated values over the raw URL search, so a key left out here would
  // keep its raw, unvalidated value. Every key is therefore returned, as undefined when invalid.
  validateSearch: ({
    q,
    specialty,
    tab,
    gender,
    lang,
    fee,
    exp,
    sort,
  }: Record<string, unknown>): DiscoverSearch => ({
    q: typeof q === "string" && q.trim() ? q.trim().slice(0, 100) : undefined,
    specialty: typeof specialty === "string" && specialtyInfo(specialty) ? specialty : undefined,
    tab: tab === "clinics" ? "clinics" : undefined,
    gender: gender === "female" || gender === "male" ? gender : undefined,
    lang: typeof lang === "string" && /^[\p{L}\p{M} ]{1,40}$/u.test(lang) ? lang : undefined,
    fee: boundedInt(fee, 1, 1_000_000),
    exp: boundedInt(exp, 1, 100),
    sort: sort === "fee_asc" || sort === "fee_desc" || sort === "experience" ? sort : undefined,
  }),
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

const SORT_OPTIONS: { value: DoctorSort; label: MessageKey }[] = [
  { value: "name", label: "discover.sort.name" },
  { value: "fee_asc", label: "discover.sort.feeAsc" },
  { value: "fee_desc", label: "discover.sort.feeDesc" },
  { value: "experience", label: "discover.sort.experience" },
];

function Discover() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/discover" });
  const { doctors: catalogDoctors, clinics: catalogClinics, catalog } = useApp();
  const { t, fmt } = useI18n();

  const [text, setText] = useState(search.q ?? "");
  const debouncedText = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const specialtyId = search.specialty ?? "";
  const tab: DiscoverTab = search.tab ?? "doctors";

  const gender: DoctorFilters["gender"] = search.gender ?? "any";
  const language = search.lang ?? "";
  const maxFee = search.fee ?? null;
  const minExperience = search.exp ?? 0;
  const sort: DoctorSort = search.sort ?? "name";
  const setFilter = <K extends keyof DiscoverSearch>(key: K, value: DiscoverSearch[K]) =>
    navigate({ search: (prev) => withParam(prev, key, value), replace: true });
  const setGender = (g: DoctorFilters["gender"]) =>
    setFilter("gender", g === "any" ? undefined : g);
  const setLanguage = (l: string) => setFilter("lang", l || undefined);
  const setMaxFee = (fee: number | null) => setFilter("fee", fee ?? undefined);
  const setMinExperience = (years: number) => setFilter("exp", years > 0 ? years : undefined);
  const setSort = (value: DoctorSort) => setFilter("sort", value === "name" ? undefined : value);
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
  const clinicFilters: ClinicFilters = { text: debouncedText, specialtyId };

  // The shared catalog (also needed for the filter options above and clinic names on cards)
  // already holds every doctor and clinic, so unfiltered results are read from it instead of
  // re-requesting the same rows. Filtered searches still run in Postgres.
  const catalogReady = !catalog.isLoading && !catalog.error;
  const searchCatalog = useMemo(
    () => (catalogReady ? { clinics: catalogClinics, doctors: catalogDoctors } : undefined),
    [catalogReady, catalogClinics, catalogDoctors],
  );
  const allDoctors = useMemo(
    () => (catalogReady ? unfilteredDoctors(catalogDoctors, sort) : undefined),
    [catalogReady, catalogDoctors, sort],
  );
  const allClinics = useMemo(
    () => (catalogReady ? unfilteredClinics(catalogClinics) : undefined),
    [catalogReady, catalogClinics],
  );
  // While a new search loads, keep showing the list the user was already looking at (never
  // a list they haven't seen: a direct link to a search shows a skeleton until it resolves).
  const shownDoctors = useRef<Doctor[] | undefined>(undefined);
  const shownClinics = useRef<Clinic[] | undefined>(undefined);
  const doctorsQuery = useDoctorSearch(doctorFilters, searchCatalog, shownDoctors.current);
  const clinicsQuery = useClinicSearch(clinicFilters, shownClinics.current);

  const catalogSource = <T,>(data: T[] | undefined): ResultsSource<T> => ({
    data,
    error: catalog.error,
    isPending: catalog.isLoading,
    refetch: catalog.refetch,
  });
  const doctorResults: ResultsSource<Doctor> = hasDoctorCriteria(doctorFilters)
    ? catalog.error
      ? catalogSource(undefined)
      : doctorsQuery
    : catalogSource(allDoctors);
  const clinicResults: ResultsSource<Clinic> = hasClinicCriteria(clinicFilters)
    ? clinicsQuery
    : catalogSource(allClinics);

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
    navigate({
      search: ({ gender: _g, lang: _l, fee: _f, exp: _e, ...rest }) => rest,
      replace: true,
    });
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

  const doctors = doctorResults.data;
  const clinics = clinicResults.data;
  useEffect(() => {
    if (doctors) shownDoctors.current = doctors;
    if (clinics) shownClinics.current = clinics;
  }, [doctors, clinics]);
  const updating =
    (doctorsQuery.isFetching && doctorsQuery.isPlaceholderData) ||
    (clinicsQuery.isFetching && clinicsQuery.isPlaceholderData) ||
    text.trim() !== debouncedText;

  return (
    <PatientShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("discover.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("discover.subtitle")}</p>
        </div>

        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="surface-card flex items-center gap-2 p-2 pl-4 focus-within:ring-2 focus-within:ring-ring"
        >
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <label htmlFor="discover-search" className="sr-only">
            {t("discover.searchLabel")}
          </label>
          <input
            id="discover-search"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("discover.searchPlaceholder")}
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
              aria-label={t("discover.clearSearch")}
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
            {activeFilterCount
              ? t("discover.filtersCount", { count: activeFilterCount })
              : t("discover.filters")}
          </Button>
        </form>

        {specialtyOptions.length ? (
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label={t("discover.specialty")}
          >
            <button
              type="button"
              className={chip(!specialtyId)}
              aria-pressed={!specialtyId}
              onClick={() => setSpecialty("")}
            >
              {t("discover.allSpecialties")}
            </button>
            {specialtyOptions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={chip(specialtyId === s.id)}
                aria-pressed={specialtyId === s.id}
                onClick={() => setSpecialty(specialtyId === s.id ? "" : s.id)}
              >
                {fmt.specialty(s.id)}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside
            id="discover-filters"
            aria-label={t("discover.doctorFilters")}
            className={cn(
              "surface-card h-fit space-y-5 p-4 lg:sticky lg:top-24 lg:block",
              showFilters ? "block" : "hidden",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t("discover.filters")}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
              >
                {t("discover.reset")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("discover.filtersApply")}</p>

            {feeBounds ? (
              <FilterGroup
                label={
                  maxFee === null
                    ? t("discover.feeAny")
                    : t("discover.feeUpTo", { fee: fmt.inr(maxFee) })
                }
                id="fee-filter"
              >
                <Slider
                  aria-labelledby="fee-filter"
                  thumbLabel={t("discover.feeThumb")}
                  valueText={
                    maxFee === null
                      ? t("discover.feeAnyValue")
                      : t("discover.feeUpToValue", { fee: fmt.inr(maxFee) })
                  }
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
                    ? t("discover.experienceMin", {
                        years: t.plural("common.years", minExperience),
                      })
                    : t("discover.experienceAny")
                }
                id="experience-filter"
              >
                <Slider
                  aria-labelledby="experience-filter"
                  thumbLabel={t("discover.experienceThumb")}
                  valueText={
                    minExperience > 0
                      ? t("discover.experienceOrMore", {
                          years: t.plural("common.years", minExperience),
                        })
                      : t("common.any")
                  }
                  className="mt-3"
                  min={0}
                  max={maxExperienceOption}
                  step={1}
                  value={[minExperience]}
                  onValueChange={([v]) => setMinExperience(v ?? 0)}
                />
              </FilterGroup>
            ) : null}

            <FilterGroup label={t("discover.gender")} id="gender-filter">
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
                    {t(
                      g === "any" ? "common.any" : g === "female" ? "common.female" : "common.male",
                    )}
                  </button>
                ))}
              </div>
            </FilterGroup>

            {languageOptions.length ? (
              <FilterGroup label={t("discover.language")} id="language-filter">
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
                    {t("common.any")}
                  </button>
                  {languageOptions.map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={chip(language === l)}
                      aria-pressed={language === l}
                      onClick={() => setLanguage(language === l ? "" : l)}
                    >
                      {fmt.languageName(l)}
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
                    {doctors
                      ? t("discover.doctorsTabCount", { count: fmt.number(doctors.length) })
                      : t("discover.doctorsTab")}
                  </TabsTrigger>
                  <TabsTrigger value="clinics">
                    {clinics
                      ? t("discover.clinicsTabCount", { count: fmt.number(clinics.length) })
                      : t("discover.clinicsTab")}
                  </TabsTrigger>
                </TabsList>
                {tab === "doctors" ? (
                  <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                    <label htmlFor="sort" className="shrink-0 text-xs text-muted-foreground">
                      {t("discover.sortBy")}
                    </label>
                    <select
                      id="sort"
                      value={sort}
                      onChange={(e) => {
                        const next = SORT_VALUES.find((v) => v === e.target.value);
                        if (next) setSort(next);
                      }}
                      className="min-w-0 flex-1 truncate rounded-lg border bg-card px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none"
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {t(o.label)}
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
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />{" "}
                    {t("discover.updating")}
                  </>
                ) : null}
              </p>

              <TabsContent value="doctors" className="mt-1">
                <ResultsState
                  query={doctorResults}
                  errorTitle={t("discover.loadErrorDoctors")}
                  loadingLabel={t("discover.loadingDoctors")}
                  emptyTitle={t("discover.noDoctorsTitle")}
                  emptyDescription={
                    hasAnyCriteria ? t("discover.noDoctorsFiltered") : t("discover.noDoctorsListed")
                  }
                  onClear={hasAnyCriteria ? clearEverything : undefined}
                >
                  {(list) => (
                    <>
                      <p className="mb-3 text-sm text-muted-foreground">
                        {t.plural(
                          hasAnyCriteria ? "discover.matches" : "discover.listed",
                          list.length,
                        )}
                        {list.length >= SEARCH_RESULT_LIMIT
                          ? ` ${t("discover.limitNote", { limit: fmt.number(SEARCH_RESULT_LIMIT) })}`
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
                  query={clinicResults}
                  errorTitle={t("discover.loadErrorClinics")}
                  loadingLabel={t("discover.loadingClinics")}
                  emptyTitle={t("discover.noClinicsTitle")}
                  emptyDescription={
                    debouncedText || specialtyId
                      ? t("discover.noClinicsFiltered")
                      : t("discover.noClinicsListed")
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

/** What a results list needs, whether it comes from the catalog or a search query. */
interface ResultsSource<T> {
  data: T[] | undefined;
  error: Error | null;
  isPending: boolean;
  refetch: () => unknown;
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
  errorTitle,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  onClear,
  children,
}: {
  query: ResultsSource<T>;
  errorTitle: string;
  loadingLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  onClear: (() => void) | undefined;
  children: (list: T[]) => ReactNode;
}) {
  const { t } = useI18n();
  // An error always wins: never show results from a previous search as if they matched this one.
  if (query.error) {
    return (
      <ErrorState
        title={errorTitle}
        message={t(describeDataError(query.error))}
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
              {t("discover.clearAll")}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <>{children(query.data)}</>;
}
