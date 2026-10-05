import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { FormAlert } from "@/components/AuthCard";
import { EmptyState, ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { PatientShell } from "@/components/layout/PatientShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { isoDate } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/i18n";
import {
  CONTACT_METHODS,
  CONTACT_OUTCOMES,
  EVIDENCE_TYPES,
  PERMISSION_STATUSES,
  REQUIRED_EVIDENCE,
  REVIEW_STATUSES,
  safeExternalUrl,
  useCandidateCatalogue,
  useCandidateDetail,
  useLogContact,
  useRecordEvidence,
  useUpdateCandidate,
  useUpdateRelationship,
  type CandidateCatalogue,
  type CandidateEvidence,
  type CandidateKind,
  type CandidateRelationship,
  type CandidateSource,
  type Confidence,
  type ContactMethod,
  type ContactOutcome,
  type DoctorCandidate,
  type EvidenceType,
  type FacilityCandidate,
  type PermissionStatus,
  type ReviewStatus,
} from "@/lib/supabase/candidates";
import { codeOf, describeDataError, isNotDeployed, messageOf } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";

interface ProvidersSearch {
  tab?: "facilities" | "doctors" | undefined;
  id?: string | undefined;
}

export const Route = createFileRoute("/admin_/providers")({
  validateSearch: ({ tab, id }: Record<string, unknown>): ProvidersSearch => ({
    tab: tab === "doctors" ? "doctors" : tab === "facilities" ? "facilities" : undefined,
    id: typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined,
  }),
  head: () => ({ meta: [{ title: "Provider candidates — CareConnect administration" }] }),
  component: ProvidersReviewPage,
});

function ProvidersReviewPage() {
  const { t } = useI18n();
  return (
    <PatientShell>
      <Link
        to="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        {t("admin.title")}
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold [overflow-wrap:anywhere] sm:text-3xl">
        {t("candidates.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("candidates.subtitle")}</p>
      <div
        role="note"
        className="mt-4 flex gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm text-foreground"
      >
        <ShieldAlert
          className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground dark:text-warning"
          aria-hidden
        />
        <div>
          <p className="font-semibold">{t("candidates.bannerTitle")}</p>
          <p className="mt-1">{t("candidates.bannerBody")}</p>
        </div>
      </div>
      <div className="mt-6">
        <AdminGate>
          <Review />
        </AdminGate>
      </div>
    </PatientShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------------------------

const STATUS_TONE: Record<ReviewStatus, string> = {
  candidate: "bg-muted text-muted-foreground",
  under_review: "bg-info/15 text-info",
  contact_pending: "bg-warning/15 text-warning-foreground dark:text-warning",
  contacted: "bg-info/15 text-info",
  verification_pending: "bg-warning/15 text-warning-foreground dark:text-warning",
  verified: "bg-highlight-soft text-highlight",
  rejected: "bg-destructive/12 text-destructive",
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: ReviewStatus }) {
  const { t } = useI18n();
  return (
    <Pill className={STATUS_TONE[status]}>{t(`candidates.status.${status}` as MessageKey)}</Pill>
  );
}

function ConfidencePill({ value }: { value: Confidence }) {
  const { t } = useI18n();
  const tone =
    value === "high"
      ? "bg-success/15 text-success"
      : value === "medium"
        ? "bg-info/15 text-info"
        : "bg-warning/15 text-warning-foreground dark:text-warning";
  return <Pill className={tone}>{t(`candidates.confidence.${value}` as MessageKey)}</Pill>;
}

function ResearchStatusPill({ status }: { status: CandidateRelationship["research_status"] }) {
  const { t } = useI18n();
  return status === "CONFIRMED_PUBLIC" ? (
    <Pill className="bg-success/15 text-success">{t("candidates.research.confirmedPublic")}</Pill>
  ) : (
    <Pill className="bg-warning/15 text-warning-foreground dark:text-warning">
      {t("candidates.research.needsConfirmation")}
    </Pill>
  );
}

function ResearchId({ id }: { id: string }) {
  return (
    <span
      dir="ltr"
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
    >
      {id}
    </span>
  );
}

function ExternalLinkText({ url }: { url: string }) {
  const safe = safeExternalUrl(url);
  if (!safe)
    return (
      <span dir="ltr" className="break-all">
        {url}
      </span>
    );
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      dir="ltr"
      className="inline-flex items-start gap-1 break-all font-medium text-primary underline-offset-2 hover:underline"
    >
      {url}
      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
    </a>
  );
}

function Issues({ issues }: { issues: string[] }) {
  const { t } = useI18n();
  if (!issues.length)
    return <p className="text-sm text-muted-foreground">{t("candidates.noIssues")}</p>;
  return (
    <ul className="space-y-1.5">
      {issues.map((issue, i) => (
        <li key={i} className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground dark:text-warning"
            aria-hidden
          />
          <span dir="auto">{issue}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-4" aria-label={title}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Sources({ sources }: { sources: CandidateSource[] }) {
  const { t, fmt } = useI18n();
  if (!sources.length)
    return <p className="text-sm text-muted-foreground">{t("candidates.noSources")}</p>;
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.id} className="rounded-lg border p-3 text-sm">
          <ExternalLinkText url={s.url} />
          <p className="mt-1" dir="auto">
            {s.supports}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{t(`candidates.sourceType.${s.source_type}` as MessageKey)}</span>
            <span aria-hidden>·</span>
            <span>{t("candidates.researchedOn", { date: fmt.longDate(s.researched_on) })}</span>
            <ConfidencePill value={s.confidence} />
          </p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// List and filters
// ---------------------------------------------------------------------------------------------

interface Filters {
  text: string;
  status: ReviewStatus | "";
  place: string;
  confidence: Confidence | "";
  issuesOnly: boolean;
}

const EMPTY_FILTERS: Filters = {
  text: "",
  status: "",
  place: "",
  confidence: "",
  issuesOnly: false,
};

function Review() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const tab = search.tab ?? "facilities";
  const catalogue = useCandidateCatalogue(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  if (catalogue.isLoading) return <PageLoader label={t("common.loading")} />;
  if (catalogue.error) {
    return isNotDeployed(catalogue.error) ? (
      <InfoNotice>{t("candidates.notDeployed")}</InfoNotice>
    ) : (
      <ErrorState
        title={t("candidates.loadError")}
        message={t(describeDataError(catalogue.error))}
        onRetry={() => void catalogue.refetch()}
      />
    );
  }
  const data = catalogue.data ?? { facilities: [], doctors: [], relationships: [] };
  if (data.facilities.length === 0 && data.doctors.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title={t("candidates.emptyTitle")}
        description={t("candidates.emptyBody")}
      />
    );
  }

  const select = (kind: "facilities" | "doctors", id?: string) =>
    navigate({ to: "/admin/providers", search: { tab: kind, ...(id ? { id } : {}) } });

  return (
    <div className="space-y-5">
      <Summary data={data} />
      <div
        role="tablist"
        aria-label={t("candidates.title")}
        className="inline-flex rounded-xl bg-muted p-1"
      >
        {(["facilities", "doctors"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              select(k);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === k
                ? "bg-card text-highlight shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "facilities" ? (
              <Building2 className="h-4 w-4" aria-hidden />
            ) : (
              <Stethoscope className="h-4 w-4" aria-hidden />
            )}
            {k === "facilities"
              ? t("candidates.tab.facilities", { count: data.facilities.length })
              : t("candidates.tab.doctors", { count: data.doctors.length })}
          </button>
        ))}
      </div>
      <FilterBar tab={tab} data={data} filters={filters} onChange={setFilters} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className={cn(search.id && "hidden lg:block")}>
          <CandidateList
            tab={tab}
            data={data}
            filters={filters}
            selectedId={search.id}
            onSelect={(id) => select(tab, id)}
          />
        </div>
        <div className={cn(!search.id && "hidden lg:block")}>
          {search.id ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="mb-2 lg:hidden"
                onClick={() => select(tab)}
              >
                <ArrowLeft className="rtl:rotate-180" aria-hidden />
                {t("candidates.backToList")}
              </Button>
              <Detail
                key={search.id}
                kind={tab === "facilities" ? "facility" : "doctor"}
                id={search.id}
                data={data}
                onOpen={(kind, id) => select(kind === "facility" ? "facilities" : "doctors", id)}
              />
            </>
          ) : (
            <div className="surface-card grid place-items-center p-10 text-sm text-muted-foreground">
              {t("candidates.selectPrompt")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ data }: { data: CandidateCatalogue }) {
  const { t } = useI18n();
  const possible = data.relationships.filter(
    (r) => r.research_status === "POSSIBLE_NEEDS_CONFIRMATION",
  ).length;
  const withIssues =
    data.facilities.filter((f) => f.unresolved_issues.length).length +
    data.doctors.filter((d) => d.unresolved_issues.length).length;
  const verified =
    data.facilities.filter((f) => f.review_status === "verified").length +
    data.doctors.filter((d) => d.review_status === "verified").length;
  const items: [string, number][] = [
    [t("candidates.summary.facilities"), data.facilities.length],
    [t("candidates.summary.doctors"), data.doctors.length],
    [t("candidates.summary.relationships"), data.relationships.length],
    [t("candidates.summary.needsConfirmation"), possible],
    [t("candidates.summary.withIssues"), withIssues],
    [t("candidates.summary.verified"), verified],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border bg-card p-3">
          <dt className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{label}</dt>
          <dd className="mt-1 font-display text-xl font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FilterBar({
  tab,
  data,
  filters,
  onChange,
}: {
  tab: "facilities" | "doctors";
  data: CandidateCatalogue;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const { t } = useI18n();
  const places = useMemo(() => {
    const values =
      tab === "facilities"
        ? data.facilities.map((f) => f.locality)
        : data.doctors.map((d) => d.specialty);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [tab, data]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
      <div className="space-y-1">
        <Label htmlFor="candidate-search">{t("candidates.filter.search")}</Label>
        <Input
          id="candidate-search"
          type="search"
          value={filters.text}
          onChange={(e) => set("text", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="candidate-status">{t("candidates.filter.status")}</Label>
        <NativeSelect
          id="candidate-status"
          value={filters.status}
          onChange={(e) => set("status", e.target.value as Filters["status"])}
        >
          <option value="">{t("candidates.filter.any")}</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`candidates.status.${s}` as MessageKey)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="candidate-place">
          {tab === "facilities"
            ? t("candidates.filter.locality")
            : t("candidates.filter.specialty")}
        </Label>
        <NativeSelect
          id="candidate-place"
          value={filters.place}
          onChange={(e) => set("place", e.target.value)}
        >
          <option value="">{t("candidates.filter.any")}</option>
          {places.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="candidate-confidence">{t("candidates.filter.confidence")}</Label>
        <NativeSelect
          id="candidate-confidence"
          value={filters.confidence}
          onChange={(e) => set("confidence", e.target.value as Filters["confidence"])}
        >
          <option value="">{t("candidates.filter.any")}</option>
          {(["high", "medium", "low"] as const).map((c) => (
            <option key={c} value={c}>
              {t(`candidates.confidence.${c}` as MessageKey)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={filters.issuesOnly}
          onChange={(e) => set("issuesOnly", e.target.checked)}
          className="h-4 w-4 accent-[var(--color-highlight)]"
        />
        {t("candidates.filter.issuesOnly")}
      </label>
    </div>
  );
}

function matches(
  f: Filters,
  text: string[],
  status: ReviewStatus,
  place: string,
  confidence: Confidence,
  issues: string[],
) {
  const q = f.text.trim().toLowerCase();
  return (
    (!q || text.some((s) => s.toLowerCase().includes(q))) &&
    (!f.status || status === f.status) &&
    (!f.place || place === f.place) &&
    (!f.confidence || confidence === f.confidence) &&
    (!f.issuesOnly || issues.length > 0)
  );
}

function CandidateList({
  tab,
  data,
  filters,
  selectedId,
  onSelect,
}: {
  tab: "facilities" | "doctors";
  data: CandidateCatalogue;
  filters: Filters;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const relCount = (id: string, key: "facility_candidate_id" | "doctor_candidate_id") =>
    data.relationships.filter((r) => r[key] === id).length;
  const rows =
    tab === "facilities"
      ? data.facilities
          .filter((f) =>
            matches(
              filters,
              [f.name, f.research_id, f.locality, f.facility_type, ...f.specialties],
              f.review_status,
              f.locality,
              f.source_confidence,
              f.unresolved_issues,
            ),
          )
          .map((f) => ({
            id: f.id,
            researchId: f.research_id,
            title: f.name,
            meta: `${f.facility_type} · ${f.locality}`,
            status: f.review_status,
            confidence: f.source_confidence,
            issues: f.unresolved_issues.length,
            links: relCount(f.id, "facility_candidate_id"),
          }))
      : data.doctors
          .filter((d) =>
            matches(
              filters,
              [d.full_name, d.research_id, d.specialty, d.qualifications ?? ""],
              d.review_status,
              d.specialty,
              d.source_confidence,
              d.unresolved_issues,
            ),
          )
          .map((d) => ({
            id: d.id,
            researchId: d.research_id,
            title: d.full_name,
            meta: d.specialty,
            status: d.review_status,
            confidence: d.source_confidence,
            issues: d.unresolved_issues.length,
            links: relCount(d.id, "doctor_candidate_id"),
          }));

  if (!rows.length) return <EmptyState icon={Search} title={t("candidates.noMatches")} />;
  return (
    <ul
      className="space-y-2"
      aria-label={
        tab === "facilities" ? t("candidates.summary.facilities") : t("candidates.summary.doctors")
      }
    >
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            aria-current={selectedId === r.id ? "true" : undefined}
            className={cn(
              "w-full rounded-xl border bg-card p-3 text-start transition-[border-color,box-shadow] hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedId === r.id && "border-highlight/60 shadow-raised",
            )}
          >
            <span className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-semibold [overflow-wrap:anywhere]" dir="auto">
                  {r.title}
                </span>
                <span
                  className="block text-xs text-muted-foreground [overflow-wrap:anywhere]"
                  dir="auto"
                >
                  {r.meta}
                </span>
              </span>
              <StatusPill status={r.status} />
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ResearchId id={r.researchId} />
              <ConfidencePill value={r.confidence} />
              <span>{t("candidates.linksCount", { count: r.links })}</span>
              {r.issues ? (
                <span className="inline-flex items-center gap-1 text-warning-foreground dark:text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {t("candidates.issuesCount", { count: r.issues })}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------------------------

function Detail({
  kind,
  id,
  data,
  onOpen,
}: {
  kind: CandidateKind;
  id: string;
  data: CandidateCatalogue;
  onOpen: (kind: CandidateKind, id: string) => void;
}) {
  const { t, fmt } = useI18n();
  const facility = kind === "facility" ? data.facilities.find((f) => f.id === id) : undefined;
  const doctor = kind === "doctor" ? data.doctors.find((d) => d.id === id) : undefined;
  const record = facility ?? doctor;
  const relationships = data.relationships.filter((r) =>
    kind === "facility" ? r.facility_candidate_id === id : r.doctor_candidate_id === id,
  );
  const detail = useCandidateDetail(
    kind,
    record ? id : undefined,
    relationships.map((r) => r.id),
  );

  if (!record) return <InfoNotice>{t("candidates.notFound")}</InfoNotice>;

  const facts: [string, ReactNode][] = facility
    ? [
        [t("candidates.field.type"), facility.facility_type],
        [t("candidates.field.address"), facility.address ?? t("common.notProvided")],
        [t("candidates.field.locality"), facility.locality],
        [
          t("candidates.field.website"),
          facility.website ? <ExternalLinkText url={facility.website} /> : t("common.notProvided"),
        ],
        [
          t("candidates.field.specialties"),
          facility.specialties.join(", ") || t("common.notProvided"),
        ],
      ]
    : [
        [t("candidates.field.specialty"), doctor!.specialty],
        [t("candidates.field.qualifications"), doctor!.qualifications ?? t("common.notProvided")],
        [
          t("candidates.field.registrationInfo"),
          doctor!.registration_info ?? t("common.notProvided"),
        ],
        [
          t("candidates.field.registrationStatus"),
          t(`candidates.registration.${doctor!.registration_status}` as MessageKey),
        ],
      ];
  facts.push(
    [t("candidates.field.researchedOn"), fmt.longDate(record.researched_on)],
    [t("candidates.field.confidence"), <ConfidencePill key="c" value={record.source_confidence} />],
  );

  return (
    <article
      className="surface-card space-y-5 p-5"
      aria-label={facility?.name ?? doctor!.full_name}
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ResearchId id={record.research_id} />
          <Pill className="bg-warning/15 text-warning-foreground dark:text-warning">
            {t("candidates.notVerifiedBadge")}
          </Pill>
          <Pill className="bg-muted text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden />
            {t("candidates.bookingOff")}
          </Pill>
          <StatusPill status={record.review_status} />
        </div>
        <h2 className="font-display text-xl font-bold [overflow-wrap:anywhere]" dir="auto">
          {facility?.name ?? doctor!.full_name}
        </h2>
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]" dir="auto">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <Section title={t("candidates.section.issues")}>
        <Issues issues={record.unresolved_issues} />
      </Section>

      {detail.isLoading ? (
        <PageLoader label={t("common.loading")} />
      ) : detail.error ? (
        <ErrorState
          title={t("candidates.loadError")}
          message={t(describeDataError(detail.error))}
          onRetry={() => void detail.refetch()}
        />
      ) : (
        <>
          <Section title={t("candidates.section.sources")}>
            <Sources sources={detail.data?.sources ?? []} />
          </Section>
          <Section
            title={
              kind === "facility"
                ? t("candidates.section.doctors")
                : t("candidates.section.facilities")
            }
          >
            <Relationships
              kind={kind}
              relationships={relationships}
              data={data}
              sources={detail.data?.relationshipSources ?? []}
              evidence={detail.data?.relationshipEvidence ?? []}
              onOpen={onOpen}
            />
          </Section>
          <Section title={t("candidates.section.review")}>
            <ReviewForm kind={kind} record={record} evidence={detail.data?.evidence ?? []} />
          </Section>
          <Section title={t("candidates.section.evidence")}>
            <EvidenceList evidence={detail.data?.evidence ?? []} />
            <EvidenceForm subject={{ kind, id }} />
          </Section>
          <Section title={t("candidates.section.contacts")}>
            <ContactList contacts={detail.data?.contacts ?? []} />
            <ContactForm kind={kind} id={id} />
          </Section>
        </>
      )}
    </article>
  );
}

function Relationships({
  kind,
  relationships,
  data,
  sources,
  evidence,
  onOpen,
}: {
  kind: CandidateKind;
  relationships: CandidateRelationship[];
  data: CandidateCatalogue;
  sources: CandidateSource[];
  evidence: CandidateEvidence[];
  onOpen: (kind: CandidateKind, id: string) => void;
}) {
  const { t } = useI18n();
  const update = useUpdateRelationship();
  if (!relationships.length)
    return <p className="text-sm text-muted-foreground">{t("candidates.noRelationships")}</p>;
  return (
    <ul className="space-y-3">
      {relationships.map((r) => {
        const other =
          kind === "facility"
            ? data.doctors.find((d) => d.id === r.doctor_candidate_id)
            : data.facilities.find((f) => f.id === r.facility_candidate_id);
        const otherName = other ? ("full_name" in other ? other.full_name : other.name) : "";
        const relEvidence = evidence.filter((e) => e.relationship_id === r.id);
        return (
          <li key={r.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  other && onOpen(kind === "facility" ? "doctor" : "facility", other.id)
                }
                className="min-w-0 text-start font-semibold text-primary underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                dir="auto"
              >
                {otherName}
              </button>
              <div className="flex flex-wrap gap-1.5">
                <ResearchStatusPill status={r.research_status} />
                <ConfidencePill value={r.confidence} />
              </div>
            </div>
            <Issues issues={r.unresolved_issues} />
            <Sources sources={sources.filter((s) => s.relationship_id === r.id)} />
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1 space-y-1">
                <Label htmlFor={`rel-${r.id}`}>{t("candidates.careconnectStatus")}</Label>
                <NativeSelect
                  id={`rel-${r.id}`}
                  value={r.careconnect_status}
                  disabled={update.isPending}
                  onChange={async (e) => {
                    const next = e.target.value as CandidateRelationship["careconnect_status"];
                    try {
                      await update.mutateAsync({ id: r.id, careconnectStatus: next });
                      toast.success(t("candidates.saved"));
                    } catch (err) {
                      toast.error(explain(err, t));
                    }
                  }}
                >
                  {(["unverified", "confirmed", "rejected"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`candidates.relationship.${s}` as MessageKey)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {relEvidence.some((e) => e.evidence_type === "doctor_clinic_relationship")
                ? t("candidates.relationshipEvidenceRecorded")
                : t("candidates.relationshipEvidenceNeeded")}
            </p>
            <EvidenceForm
              subject={{ kind: "relationship", id: r.id }}
              fixedType="doctor_clinic_relationship"
              compact
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Human-readable reason for a refused change (P0001 from the 00056 triggers, RLS, etc.). */
function explain(err: unknown, t: ReturnType<typeof useI18n>["t"]) {
  if (codeOf(err) === "P0001") {
    const message = messageOf(err);
    if (/verification needs evidence/i.test(message)) return t("candidates.error.needsEvidence");
    if (/permission can only be marked granted/i.test(message))
      return t("candidates.error.needsPermissionEvidence");
    if (/confirming a relationship/i.test(message))
      return t("candidates.error.needsRelationshipEvidence");
  }
  return t(describeDataError(err));
}

function ReviewForm({
  kind,
  record,
  evidence,
}: {
  kind: CandidateKind;
  record: FacilityCandidate | DoctorCandidate;
  evidence: CandidateEvidence[];
}) {
  const { t } = useI18n();
  const update = useUpdateCandidate();
  const [status, setStatus] = useState<ReviewStatus>(record.review_status);
  const [permission, setPermission] = useState<PermissionStatus>(record.permission_status);
  const [notes, setNotes] = useState(record.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const have = new Set(evidence.map((e) => e.evidence_type));
  const required = REQUIRED_EVIDENCE[kind];

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({
        kind,
        id: record.id,
        update: {
          review_status: status,
          permission_status: permission,
          notes: notes.trim() || null,
        },
      });
      toast.success(t("candidates.saved"));
    } catch (err) {
      setError(explain(err, t));
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="rounded-xl bg-muted/60 p-3 text-sm">
        <p className="font-semibold">{t("candidates.requiredEvidence")}</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {[...required, "listing_permission" as EvidenceType].map((type) => (
            <li key={type} className="flex items-center gap-1.5">
              {have.has(type) ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span>
                {t(`candidates.evidence.${type}` as MessageKey)}
                <span className="sr-only">
                  {" "}
                  {have.has(type)
                    ? t("candidates.evidenceRecorded")
                    : t("candidates.evidenceMissing")}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t("candidates.requiredEvidenceNote")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="review-status">{t("candidates.reviewStatus")}</Label>
          <NativeSelect
            id="review-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReviewStatus)}
          >
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`candidates.status.${s}` as MessageKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="permission-status">{t("candidates.permission")}</Label>
          <NativeSelect
            id="permission-status"
            value={permission}
            onChange={(e) => setPermission(e.target.value as PermissionStatus)}
          >
            {PERMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`candidates.permissionStatus.${s}` as MessageKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="review-notes">{t("candidates.notes")}</Label>
        <Textarea
          id="review-notes"
          rows={3}
          maxLength={4000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("candidates.saveReview")}
      </Button>
    </form>
  );
}

function EvidenceList({ evidence }: { evidence: CandidateEvidence[] }) {
  const { t, fmt } = useI18n();
  if (!evidence.length)
    return <p className="text-sm text-muted-foreground">{t("candidates.noEvidence")}</p>;
  return (
    <ul className="space-y-2">
      {evidence.map((e) => (
        <li key={e.id} className="rounded-lg border p-3 text-sm">
          <p className="font-semibold">
            {t(`candidates.evidence.${e.evidence_type}` as MessageKey)}
          </p>
          <p className="mt-1" dir="auto">
            {e.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground" dir="auto">
            {t("candidates.evidenceSource")}: {e.source}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("candidates.recordedOn", { date: fmt.longDate(e.recorded_at.slice(0, 10)) })}
          </p>
        </li>
      ))}
    </ul>
  );
}

function EvidenceForm({
  subject,
  fixedType,
  compact,
}: {
  subject: { kind: CandidateKind | "relationship"; id: string };
  fixedType?: EvidenceType;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const record = useRecordEvidence();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EvidenceType>(fixedType ?? "provider_identity");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prefix = `ev-${subject.id}`;

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {compact ? t("candidates.addRelationshipEvidence") : t("candidates.addEvidence")}
      </Button>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (value.trim().length < 2 || source.trim().length < 2)
      return setError(t("candidates.error.evidenceFields"));
    setError(null);
    try {
      await record.mutateAsync({ subject, evidenceType: type, value, source });
      toast.success(t("candidates.evidenceSaved"));
      setValue("");
      setSource("");
      setOpen(false);
    } catch (err) {
      setError(explain(err, t));
    }
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-dashed p-3">
      <p className="text-xs text-muted-foreground">{t("candidates.evidenceHelp")}</p>
      {fixedType ? null : (
        <div className="space-y-1">
          <Label htmlFor={`${prefix}-type`}>{t("candidates.evidenceType")}</Label>
          <NativeSelect
            id={`${prefix}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as EvidenceType)}
          >
            {EVIDENCE_TYPES.filter((x) => x !== "doctor_clinic_relationship").map((x) => (
              <option key={x} value={x}>
                {t(`candidates.evidence.${x}` as MessageKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-value`}>{t("candidates.evidenceValue")}</Label>
        <Textarea
          id={`${prefix}-value`}
          rows={2}
          maxLength={2000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-source`}>{t("candidates.evidenceSource")}</Label>
        <Input
          id={`${prefix}-source`}
          maxLength={1000}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={t("candidates.evidenceSourcePlaceholder")}
        />
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={record.isPending}>
          {record.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("candidates.recordEvidence")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function ContactList({
  contacts,
}: {
  contacts: {
    id: string;
    contacted_on: string;
    method: ContactMethod;
    outcome: ContactOutcome;
    permission_status: PermissionStatus;
    notes: string | null;
  }[];
}) {
  const { t, fmt } = useI18n();
  if (!contacts.length)
    return <p className="text-sm text-muted-foreground">{t("candidates.noContacts")}</p>;
  return (
    <ul className="space-y-2">
      {contacts.map((c) => (
        <li key={c.id} className="rounded-lg border p-3 text-sm">
          <p className="font-semibold">
            {fmt.longDate(c.contacted_on)} · {t(`candidates.method.${c.method}` as MessageKey)} ·{" "}
            {t(`candidates.outcome.${c.outcome}` as MessageKey)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("candidates.reportedPermission")}:{" "}
            {t(`candidates.permissionStatus.${c.permission_status}` as MessageKey)}
          </p>
          {c.notes ? (
            <p className="mt-1" dir="auto">
              {c.notes}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ContactForm({ kind, id }: { kind: CandidateKind; id: string }) {
  const { t } = useI18n();
  const log = useLogContact();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(isoDate(new Date()));
  const [method, setMethod] = useState<ContactMethod>("phone");
  const [outcome, setOutcome] = useState<ContactOutcome>("no_response");
  const [permission, setPermission] = useState<PermissionStatus>("unknown");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("candidates.logContact")}
      </Button>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await log.mutateAsync({
        kind,
        id,
        contactedOn: date,
        method,
        outcome,
        permissionStatus: permission,
        notes,
      });
      toast.success(t("candidates.contactSaved"));
      setNotes("");
      setOpen(false);
    } catch (err) {
      setError(explain(err, t));
    }
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-dashed p-3">
      <p className="text-xs text-muted-foreground">{t("candidates.contactHelp")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="contact-date">{t("candidates.contactDate")}</Label>
          <Input
            id="contact-date"
            type="date"
            max={isoDate(new Date())}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contact-method">{t("candidates.contactMethod")}</Label>
          <NativeSelect
            id="contact-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as ContactMethod)}
          >
            {CONTACT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`candidates.method.${m}` as MessageKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="contact-outcome">{t("candidates.contactOutcome")}</Label>
          <NativeSelect
            id="contact-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as ContactOutcome)}
          >
            {CONTACT_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {t(`candidates.outcome.${o}` as MessageKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="contact-permission">{t("candidates.reportedPermission")}</Label>
          <NativeSelect
            id="contact-permission"
            value={permission}
            onChange={(e) => setPermission(e.target.value as PermissionStatus)}
          >
            {PERMISSION_STATUSES.map((p) => (
              <option key={p} value={p}>
                {t(`candidates.permissionStatus.${p}` as MessageKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="contact-notes">{t("candidates.notes")}</Label>
        <Textarea
          id="contact-notes"
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={log.isPending}>
          {log.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("candidates.saveContact")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
