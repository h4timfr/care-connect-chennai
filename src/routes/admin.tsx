import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PatientShell } from "@/components/layout/PatientShell";
import { FormAlert } from "@/components/AuthCard";
import { EmptyState, ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { ApplicationStatusPill, VerificationPill } from "@/components/ProviderStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { useI18n } from "@/lib/i18n";
import { useClinics } from "@/lib/supabase/queries";
import {
  useDoctorApplicationsForReview,
  useReviewDoctorApplication,
  type DoctorApplication,
} from "@/lib/supabase/doctor";
import { describeDataError, isNotDeployed, messageOf } from "@/lib/supabase/errors";
import {
  CONTACT_ROLE_LABEL,
  useAddClinicMember,
  useAllMemberships,
  useApplicationsForReview,
  usePendingDoctorLinks,
  usePlatformAdmin,
  useReviewApplication,
  useSetLinkState,
  useSetMembershipActive,
  type Membership,
  type ProviderApplication,
} from "@/lib/supabase/providers";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administration — CareConnect" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useProtectedRoute();
  const { t } = useI18n();
  const role = usePlatformAdmin(user?.id);

  let body;
  if (loading || !user || role.isLoading) {
    body = (
      <PageLoader
        label={!loading && !user ? t("common.redirectingToSignIn") : t("admin.checking")}
      />
    );
  } else if (role.error) {
    // Fail closed: a role lookup that errors grants nothing.
    body = isNotDeployed(role.error) ? (
      <InfoNotice>{t("admin.notDeployed")}</InfoNotice>
    ) : (
      <ErrorState
        title={t("admin.checkError")}
        message={t(describeDataError(role.error))}
        onRetry={role.refetch}
      />
    );
  } else if (!role.data) {
    body = (
      <div className="flex flex-col items-center py-16 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h2 className="font-display text-xl font-bold">{t("admin.noAccessTitle")}</h2>
        <p className="mt-2 max-w-md text-muted-foreground">{t("admin.noAccessBody")}</p>
        <Button asChild className="mt-6">
          <Link to="/">{t("clinicShell.goToApp")}</Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <Tabs defaultValue="applications" className="mt-2">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="applications">{t("admin.tab.applications")}</TabsTrigger>
          <TabsTrigger value="doctor-applications">{t("admin.tab.doctorApplications")}</TabsTrigger>
          <TabsTrigger value="doctors">{t("admin.tab.doctors")}</TabsTrigger>
          <TabsTrigger value="teams">{t("admin.tab.teams")}</TabsTrigger>
        </TabsList>
        <TabsContent value="applications" className="mt-5">
          <ApplicationsPanel />
        </TabsContent>
        <TabsContent value="doctor-applications" className="mt-5">
          <DoctorApplicationsPanel />
        </TabsContent>
        <TabsContent value="doctors" className="mt-5">
          <DoctorsPanel />
        </TabsContent>
        <TabsContent value="teams" className="mt-5">
          <TeamsPanel />
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <PatientShell>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-highlight-soft text-highlight">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold [overflow-wrap:anywhere]">
            {t("admin.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("admin.subtitle")}</p>
        </div>
      </div>
      <div className="mt-6">{body}</div>
    </PatientShell>
  );
}

function PanelState({
  query,
  errorTitle,
}: {
  query: { isLoading: boolean; error: unknown; refetch: () => unknown };
  errorTitle: string;
}) {
  const { t } = useI18n();
  if (query.isLoading) return <PageLoader label={t("common.loading")} />;
  if (isNotDeployed(query.error)) return <InfoNotice>{t("admin.notDeployed")}</InfoNotice>;
  return (
    <ErrorState
      title={errorTitle}
      message={t(describeDataError(query.error))}
      onRetry={query.refetch}
    />
  );
}

// ---- Applications

function ApplicationsPanel() {
  const { t } = useI18n();
  const query = useApplicationsForReview(true);
  const [showAll, setShowAll] = useState(false);
  if (query.isLoading || query.error)
    return <PanelState query={query} errorTitle={t("admin.loadError")} />;
  const all = query.data ?? [];
  const list = showAll ? all : all.filter((a) => a.status === "submitted");
  return (
    <section aria-label={t("admin.tab.applications")} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("admin.awaiting", { count: all.filter((a) => a.status === "submitted").length })}
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t("admin.showOpen") : t("admin.showAll")}
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("admin.noApplications")} />
      ) : (
        <ul className="space-y-4">
          {list.map((a) => (
            <ApplicationReview key={a.id} application={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApplicationReview({ application: a }: { application: ProviderApplication }) {
  const { t, fmt } = useI18n();
  const review = useReviewApplication();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);

  const decide = async (approve: boolean) => {
    try {
      await review.mutateAsync({ applicationId: a.id, approve, note });
      toast.success(approve ? t("admin.approved") : t("admin.rejected"));
    } catch (err) {
      toast.error(t(describeDataError(err)));
    } finally {
      setConfirming(null);
    }
  };

  const rows: [string, string, boolean?][] = [
    [t("apply.address"), a.address],
    [t("apply.registration"), a.registrationDetails],
    [t("apply.contactName"), `${a.contactName} (${t(CONTACT_ROLE_LABEL[a.contactRole])})`],
    [t("apply.phone"), a.contactPhone, true],
    [t("apply.email"), a.contactEmail, true],
    [t("apply.doctorCount"), a.doctorCount ? String(a.doctorCount) : t("common.notProvided")],
    [t("apply.message"), a.message || t("common.notProvided")],
  ];

  return (
    <li className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold [overflow-wrap:anywhere]" dir="auto">
            {a.clinicName}
          </h3>
          <p className="text-sm text-muted-foreground" dir="auto">
            {a.area} · {t("apply.submittedOn", { date: fmt.longDate(a.createdAt.slice(0, 10)) })}
          </p>
        </div>
        <ApplicationStatusPill status={a.status} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {rows.map(([label, value, ltr]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]" dir={ltr ? "ltr" : "auto"}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {a.status === "submitted" ? (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor={`note-${a.id}`}>{t("admin.note")}</Label>
            <Textarea
              id={`note-${a.id}`}
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <InfoNotice className="text-xs">{t("admin.verifyReminder")}</InfoNotice>
          {confirming ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-highlight/40 bg-highlight-soft p-3 sm:flex-row sm:items-center"
            >
              <p className="flex-1 text-sm font-medium text-foreground">
                {confirming === "approve"
                  ? t("admin.confirmApprove", { clinic: a.clinicName })
                  : t("admin.confirmReject", { clinic: a.clinicName })}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={confirming === "approve" ? "highlight" : "destructive"}
                  disabled={review.isPending}
                  onClick={() => decide(confirming === "approve")}
                >
                  {review.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {t("admin.confirm")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => setConfirming(null)}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="highlight" onClick={() => setConfirming("approve")}>
                {t("admin.approve")}
              </Button>
              <Button variant="outline" onClick={() => setConfirming("reject")}>
                {t("admin.reject")}
              </Button>
            </div>
          )}
        </div>
      ) : a.reviewNote ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm" dir="auto">
          <span className="font-medium">{t("apply.reviewNote")}:</span> {a.reviewNote}
        </p>
      ) : null}
    </li>
  );
}

// ---- Doctor applications

function DoctorApplicationsPanel() {
  const { t } = useI18n();
  const query = useDoctorApplicationsForReview(true);
  const [showAll, setShowAll] = useState(false);
  if (query.isLoading || query.error)
    return <PanelState query={query} errorTitle={t("admin.loadError")} />;
  const all = query.data ?? [];
  const open = all.filter((a) => a.status === "submitted");
  const list = showAll ? all : open;
  return (
    <section aria-label={t("admin.tab.doctorApplications")} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("admin.awaiting", { count: open.length })}
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t("admin.showOpen") : t("admin.showAll")}
        </Button>
      </div>
      <InfoNotice className="text-sm">{t("admin.doctorApplicationsHelp")}</InfoNotice>
      {list.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("admin.noApplications")} />
      ) : (
        <ul className="space-y-4">
          {list.map((a) => (
            <DoctorApplicationReview key={a.id} application={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DoctorApplicationReview({ application: a }: { application: DoctorApplication }) {
  const { t, fmt } = useI18n();
  const review = useReviewDoctorApplication();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);

  const decide = async (approve: boolean) => {
    try {
      await review.mutateAsync({ applicationId: a.id, approve, note });
      toast.success(approve ? t("admin.doctorApproved") : t("admin.rejected"));
    } catch (err) {
      toast.error(t(describeDataError(err)));
    } finally {
      setConfirming(null);
    }
  };

  const rows: [string, string, boolean?][] = [
    [t("propose.specialty"), fmt.specialty(a.specialtyId)],
    [t("signup.doctor.qualifications"), a.qualifications],
    [t("propose.registration"), a.registration, true],
    [t("propose.experience"), String(a.experienceYears)],
    [
      t("propose.fee"),
      a.consultationFee === null ? t("common.notProvided") : fmt.inr(a.consultationFee),
    ],
    [t("signup.doctor.clinic"), a.clinicName || a.clinicNote || t("signup.doctor.noClinic")],
    [t("apply.phone"), a.contactPhone, true],
    [t("apply.email"), a.contactEmail, true],
    [t("apply.message"), a.message || t("common.notProvided")],
  ];

  return (
    <li className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold [overflow-wrap:anywhere]" dir="auto">
            {a.fullName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("apply.submittedOn", { date: fmt.longDate(a.createdAt.slice(0, 10)) })}
          </p>
        </div>
        <ApplicationStatusPill status={a.status} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {rows.map(([label, value, ltr]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]" dir={ltr ? "ltr" : "auto"}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {a.status === "submitted" ? (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor={`doctor-note-${a.id}`}>{t("admin.note")}</Label>
            <Textarea
              id={`doctor-note-${a.id}`}
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <InfoNotice className="text-xs">{t("admin.doctorVerifyReminder")}</InfoNotice>
          {confirming ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-highlight/40 bg-highlight-soft p-3 sm:flex-row sm:items-center"
            >
              <p className="flex-1 text-sm font-medium text-foreground">
                {confirming === "approve"
                  ? t("admin.confirmApproveDoctor", { name: a.fullName })
                  : t("admin.confirmReject", { clinic: a.fullName })}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={confirming === "approve" ? "highlight" : "destructive"}
                  disabled={review.isPending}
                  onClick={() => decide(confirming === "approve")}
                >
                  {review.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {t("admin.confirm")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => setConfirming(null)}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="highlight" onClick={() => setConfirming("approve")}>
                {t("admin.approveDoctor")}
              </Button>
              <Button variant="outline" onClick={() => setConfirming("reject")}>
                {t("admin.reject")}
              </Button>
            </div>
          )}
        </div>
      ) : a.reviewNote ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm" dir="auto">
          <span className="font-medium">{t("apply.reviewNote")}:</span> {a.reviewNote}
        </p>
      ) : null}
    </li>
  );
}

// ---- Doctor verification

function DoctorsPanel() {
  const { t, fmt } = useI18n();
  const query = usePendingDoctorLinks(true);
  const setState = useSetLinkState();
  if (query.isLoading || query.error)
    return <PanelState query={query} errorTitle={t("admin.loadError")} />;
  const links = query.data ?? [];
  const real = links.filter((l) => !l.isSample);
  const samples = links.length - real.length;

  const decide = async (clinicId: string, doctorId: string, state: "verified" | "rejected") => {
    try {
      await setState.mutateAsync({ clinicId, doctorId, state });
      toast.success(state === "verified" ? t("admin.doctorVerified") : t("admin.doctorRejected"));
    } catch (err) {
      toast.error(t(describeDataError(err)));
    }
  };

  return (
    <section aria-label={t("admin.tab.doctors")} className="space-y-4">
      <InfoNotice className="text-sm">{t("admin.doctorsHelp")}</InfoNotice>
      {samples > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("admin.samplesHidden", { count: samples })}
        </p>
      ) : null}
      {real.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("admin.noPendingDoctors")} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {real.map((l) => (
            <li key={`${l.clinicId}:${l.doctorId}`} className="surface-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold [overflow-wrap:anywhere]" dir="auto">
                    {l.doctorName}
                  </h3>
                  <p className="text-sm text-primary">{fmt.specialty(l.specialtyId)}</p>
                  <p className="text-sm text-muted-foreground" dir="auto">
                    {l.clinicName}
                  </p>
                </div>
                <VerificationPill state={l.state} />
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("clinicDoctors.registration")}</dt>
                  <dd className="font-medium [overflow-wrap:anywhere]" dir="auto">
                    {l.registrationNote || t("common.notProvided")}
                  </dd>
                </div>
                {l.qualifications.length ? (
                  <div>
                    <dt className="text-muted-foreground">{t("clinicDoctors.qualifications")}</dt>
                    <dd dir="auto">{l.qualifications.join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="highlight"
                  disabled={setState.isPending}
                  onClick={() => decide(l.clinicId, l.doctorId, "verified")}
                >
                  {t("admin.verify")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setState.isPending}
                  onClick={() => decide(l.clinicId, l.doctorId, "rejected")}
                >
                  {t("admin.reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Clinic teams

function TeamsPanel() {
  const { t } = useI18n();
  const memberships = useAllMemberships(true);
  const clinics = useClinics();
  const add = useAddClinicMember();
  const setActive = useSetMembershipActive();
  const [clinicId, setClinicId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Membership["role"]>("clinic_staff");
  const [error, setError] = useState<string | null>(null);

  if (memberships.isLoading || memberships.error) {
    return <PanelState query={memberships} errorTitle={t("admin.loadError")} />;
  }
  const realClinics = (clinics.data ?? []).filter((c) => !c.isSample);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError(t("admin.memberInvalid"));
      return;
    }
    setError(null);
    try {
      await add.mutateAsync({ clinicId, email, role });
      toast.success(t("admin.memberAdded"));
      setEmail("");
    } catch (err) {
      setError(
        /no CareConnect account/i.test(messageOf(err))
          ? t("admin.noAccount")
          : t(describeDataError(err)),
      );
    }
  };

  return (
    <section aria-label={t("admin.tab.teams")} className="space-y-6">
      <form onSubmit={submit} noValidate className="surface-card space-y-4 p-5">
        <h2 className="font-semibold">{t("admin.addMember")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.addMemberHelp")}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="member-clinic">{t("common.clinic")}</Label>
            <NativeSelect
              id="member-clinic"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
            >
              <option value="">{t("admin.chooseClinic")}</option>
              {realClinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-email">{t("auth.email")}</Label>
            <Input
              id="member-email"
              type="email"
              dir="ltr"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-role">{t("admin.role")}</Label>
            <NativeSelect
              id="member-role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value === "clinic_admin" ? "clinic_admin" : "clinic_staff")
              }
            >
              <option value="clinic_staff">{t("clinicShell.role.clinic_staff")}</option>
              <option value="clinic_admin">{t("clinicShell.role.clinic_admin")}</option>
            </NativeSelect>
          </div>
        </div>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("admin.addMember")}
        </Button>
      </form>

      <div>
        <h2 className="mb-3 font-semibold">{t("admin.members")}</h2>
        {(memberships.data ?? []).length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t("admin.noMembers")} />
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {(memberships.data ?? []).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium [overflow-wrap:anywhere]" dir="ltr">
                    {m.email || t("common.notProvided")}
                  </p>
                  <p className="text-sm text-muted-foreground" dir="auto">
                    {m.clinicName} ·{" "}
                    {m.role === "clinic_admin"
                      ? t("clinicShell.role.clinic_admin")
                      : t("clinicShell.role.clinic_staff")}
                    {m.active ? "" : ` · ${t("admin.inactive")}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setActive.isPending}
                  onClick={async () => {
                    try {
                      await setActive.mutateAsync({ id: m.id, active: !m.active });
                    } catch (err) {
                      toast.error(t(describeDataError(err)));
                    }
                  }}
                >
                  {m.active ? t("admin.deactivate") : t("admin.reactivate")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
