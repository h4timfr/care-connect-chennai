import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { PatientShell } from "@/components/layout/PatientShell";
import { FormAlert } from "@/components/AuthCard";
import { AdminGate } from "@/components/AdminGate";
import { GuidedTour } from "@/components/GuidedTour";
import { RoleTourOffer } from "@/components/RoleTourOffer";
import { EmptyState, ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { ApplicationStatusPill, VerificationPill } from "@/components/ProviderStatus";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateClinicPublicationState,
  type ClinicPublicationPatch,
} from "@/lib/admin-publication";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useAdminClinics } from "@/lib/supabase/queries";
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
  useSetClinicPublicationState,
  useSetMembershipActive,
  type Membership,
  type ProviderApplication,
} from "@/lib/supabase/providers";
import type { Clinic } from "@/lib/types";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: pageTitles.admin }] }),
  component: AdminPage,
});

function ReviewWorkspace() {
  const { t } = useI18n();
  const [startTour, setStartTour] = useState(0);
  const applications = useApplicationsForReview(true);
  const doctorApplications = useDoctorApplicationsForReview(true);
  const doctorLinks = usePendingDoctorLinks(true);
  const queues = [
    {
      id: "applications",
      label: t("admin.tab.applications"),
      status: queueStatus(applications, (a) => a.status === "submitted", 200),
    },
    {
      id: "doctor-applications",
      label: t("admin.tab.doctorApplications"),
      status: queueStatus(doctorApplications, (a) => a.status === "submitted", 200),
    },
    {
      id: "doctors",
      label: t("admin.tab.doctors"),
      status: queueStatus(doctorLinks, (l) => !l.isSample, 500),
    },
  ];

  function queueStatus<T>(
    query: { data: T[] | undefined; error: unknown },
    isPending: (item: T) => boolean,
    limit: number,
  ) {
    if (query.error) return t("setup.unavailable");
    if (!query.data) return t("common.loading");
    const count = query.data.filter(isPending).length;
    return t(query.data.length < limit ? "admin.awaiting" : "admin.awaitingLoaded", { count });
  }

  return (
    <>
      <div className="mb-2 flex justify-end">
        <GuidedTour role="admin" startRequested={startTour} />
      </div>
      <RoleTourOffer role="admin" onStart={() => setStartTour((value) => value + 1)} />
      <Tabs defaultValue="applications" className="space-y-4">
        <TabsList
          aria-label={t("admin.reviewNavigation")}
          className="grid w-full grid-cols-1 items-stretch gap-1.5 p-1.5 min-[360px]:grid-cols-2 xl:grid-cols-5"
        >
          {queues.map(({ id, label, status }) => (
            <TabsTrigger
              key={id}
              value={id}
              data-tour-target={`admin-${id}`}
              aria-label={label}
              aria-describedby={`admin-queue-${id}`}
              className="min-h-12 min-w-0 flex-col items-start gap-0.5 whitespace-normal px-2.5 py-2 text-start [overflow-wrap:anywhere]"
            >
              <span className="font-semibold">{label}</span>
              <span id={`admin-queue-${id}`} className="text-xs text-muted-foreground">
                {status}
              </span>
            </TabsTrigger>
          ))}
          <TabsTrigger
            value="publication"
            data-tour-target="admin-publication"
            className="min-h-12 min-w-0 justify-start whitespace-normal px-2.5 py-2 text-start font-semibold [overflow-wrap:anywhere]"
          >
            {t("admin.tab.publication")}
          </TabsTrigger>
          <TabsTrigger
            value="teams"
            className="min-h-12 min-w-0 justify-start whitespace-normal px-2.5 py-2 text-start font-semibold [overflow-wrap:anywhere]"
          >
            {t("admin.tab.teams")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="applications">
          <ApplicationsPanel query={applications} />
        </TabsContent>
        <TabsContent value="doctor-applications">
          <DoctorApplicationsPanel query={doctorApplications} />
        </TabsContent>
        <TabsContent value="doctors">
          <DoctorsPanel query={doctorLinks} />
        </TabsContent>
        <TabsContent value="publication">
          <ClinicPublicationPanel />
        </TabsContent>
        <TabsContent value="teams">
          <TeamsPanel />
        </TabsContent>
      </Tabs>
      <Link
        to="/admin/providers"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold text-primary hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("candidates.openReview")}
      </Link>
    </>
  );
}

function AdminPage() {
  const { t } = useI18n();
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
      <div className="mt-5">
        <AdminGate>
          <ReviewWorkspace />
        </AdminGate>
      </div>
    </PatientShell>
  );
}

function ClinicPublicationPanel() {
  const { t } = useI18n();
  const clinics = useAdminClinics();
  const update = useSetClinicPublicationState();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    clinic: Clinic;
    label: MessageKey;
    patch: ClinicPublicationPatch;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmationError, setConfirmationError] = useState<MessageKey | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (clinics.isLoading || clinics.error)
    return <PanelState query={clinics} errorTitle={t("admin.loadError")} />;
  const realClinics = (clinics.data ?? []).filter((c) => !c.isSample);
  const current = realClinics.find((clinic) => clinic.id === pendingAction?.clinic.id);
  const before = pendingAction?.clinic;
  const clinicChanged = Boolean(
    before &&
    (!current ||
      current.name !== before.name ||
      current.verificationState !== before.verificationState ||
      current.isPublished !== before.isPublished ||
      current.patientContactPermission !== before.patientContactPermission ||
      current.bookingEnabled !== before.bookingEnabled),
  );
  const preview = pendingAction
    ? calculateClinicPublicationState(pendingAction.clinic, pendingAction.patch)
    : null;
  const requiresAcknowledgment = pendingAction?.patch.contactPermission === "granted";
  const canConfirm =
    !update.isPending &&
    !clinics.isFetching &&
    !clinicChanged &&
    (!requiresAcknowledgment || acknowledged);

  const requestChange = (
    clinic: Clinic,
    label: MessageKey,
    patch: ClinicPublicationPatch,
    trigger: HTMLButtonElement,
  ) => {
    if (inFlight.current || pendingAction) return;
    triggerRef.current = trigger;
    setAcknowledged(false);
    setConfirmationError(null);
    setPendingAction({ clinic, label, patch });
  };

  const confirmChange = async () => {
    if (inFlight.current || !pendingAction || !preview || !canConfirm) return;
    inFlight.current = true;
    setConfirmationError(null);
    try {
      await update.mutateAsync({ clinicId: pendingAction.clinic.id, ...preview });
      if (mounted.current) {
        setPendingAction(null);
        toast.success(t("admin.publicationSaved"));
      }
    } catch (err) {
      if (mounted.current) setConfirmationError(describeDataError(err));
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <section aria-label={t("admin.tab.publication")} className="space-y-4">
      <InfoNotice className="text-sm">{t("admin.publicationHelp")}</InfoNotice>
      {realClinics.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("admin.noPublicationClinics")} />
      ) : (
        <ul className="space-y-4">
          {realClinics.map((clinic) => (
            <li key={clinic.id} className="surface-card space-y-4 p-5">
              <div>
                <h3 className="font-semibold [overflow-wrap:anywhere]">{clinic.name}</h3>
                <p className="text-sm text-muted-foreground">{clinic.area}</p>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("admin.clinicVerification")}</dt>
                  <dd>{t(`admin.state.${clinic.verificationState}`)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("admin.publication")}</dt>
                  <dd>{clinic.isPublished ? t("admin.enabled") : t("admin.disabled")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("admin.patientContact")}</dt>
                  <dd>{t(`admin.contact.${clinic.patientContactPermission}`)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("admin.onlineBooking")}</dt>
                  <dd>{clinic.bookingEnabled ? t("admin.enabled") : t("admin.disabled")}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={(event) =>
                    requestChange(
                      clinic,
                      clinic.verificationState === "verified"
                        ? "admin.markPending"
                        : "admin.verifyClinic",
                      {
                        verificationState:
                          clinic.verificationState === "verified" ? "pending" : "verified",
                      },
                      event.currentTarget,
                    )
                  }
                >
                  {clinic.verificationState === "verified"
                    ? t("admin.markPending")
                    : t("admin.verifyClinic")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending || clinic.verificationState !== "verified"}
                  onClick={(event) =>
                    requestChange(
                      clinic,
                      clinic.isPublished ? "admin.unpublish" : "admin.publish",
                      { isPublished: !clinic.isPublished },
                      event.currentTarget,
                    )
                  }
                >
                  {clinic.isPublished ? t("admin.unpublish") : t("admin.publish")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    update.isPending ||
                    !clinic.isPublished ||
                    clinic.verificationState !== "verified"
                  }
                  onClick={(event) =>
                    requestChange(
                      clinic,
                      clinic.patientContactPermission === "granted"
                        ? "admin.revokeContact"
                        : "admin.grantContact",
                      {
                        contactPermission:
                          clinic.patientContactPermission === "granted" ? "revoked" : "granted",
                      },
                      event.currentTarget,
                    )
                  }
                >
                  {clinic.patientContactPermission === "granted"
                    ? t("admin.revokeContact")
                    : t("admin.grantContact")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    update.isPending ||
                    !clinic.isPublished ||
                    clinic.verificationState !== "verified"
                  }
                  onClick={(event) =>
                    requestChange(
                      clinic,
                      clinic.bookingEnabled ? "admin.disableBooking" : "admin.enableBooking",
                      { bookingEnabled: !clinic.bookingEnabled },
                      event.currentTarget,
                    )
                  }
                >
                  {clinic.bookingEnabled ? t("admin.disableBooking") : t("admin.enableBooking")}
                </Button>
              </div>
              {clinic.patientContactPermission !== "granted" ? (
                <p className="text-xs text-muted-foreground">{t("admin.contactConsentReminder")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !inFlight.current) setPendingAction(null);
        }}
      >
        {pendingAction && preview ? (
          <AlertDialogContent
            className="min-w-0 rounded-xl"
            onCloseAutoFocus={(event) => {
              const trigger = triggerRef.current;
              if (trigger?.isConnected && !trigger.disabled) {
                event.preventDefault();
                trigger.focus();
              }
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{t(pendingAction.label)}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("admin.confirmPublicationAction", {
                  action: t(pendingAction.label),
                  clinic: pendingAction.clinic.name,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <dl className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/30 p-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("admin.clinicVerification")}</dt>
                <dd className="font-medium">{t(`admin.state.${preview.verificationState}`)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("admin.publication")}</dt>
                <dd className="font-medium">
                  {t(preview.isPublished ? "admin.enabled" : "admin.disabled")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("admin.patientContact")}</dt>
                <dd className="font-medium">{t(`admin.contact.${preview.contactPermission}`)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("admin.onlineBooking")}</dt>
                <dd className="font-medium">
                  {t(preview.bookingEnabled ? "admin.enabled" : "admin.disabled")}
                </dd>
              </div>
            </dl>
            {requiresAcknowledgment ? (
              <label className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm [overflow-wrap:anywhere]">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={acknowledged}
                  disabled={update.isPending || clinicChanged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>{t("admin.acknowledgeContactConsent")}</span>
              </label>
            ) : null}
            {clinicChanged && !update.isPending ? (
              <FormAlert>{t("admin.publicationChanged")}</FormAlert>
            ) : confirmationError ? (
              <FormAlert>{t(confirmationError)}</FormAlert>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={update.isPending}>
                {t("common.cancel")}
              </AlertDialogCancel>
              <Button type="button" disabled={!canConfirm} onClick={() => void confirmChange()}>
                {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {t("admin.confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </section>
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

function ApplicationsPanel({ query }: { query: ReturnType<typeof useApplicationsForReview> }) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  if (query.isLoading || query.error)
    return <PanelState query={query} errorTitle={t("admin.loadError")} />;
  const all = query.data ?? [];
  const list = showAll ? all : all.filter((a) => a.status === "submitted");
  return (
    <section aria-label={t("admin.tab.applications")} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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

function DoctorApplicationsPanel({
  query,
}: {
  query: ReturnType<typeof useDoctorApplicationsForReview>;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  if (query.isLoading || query.error)
    return <PanelState query={query} errorTitle={t("admin.loadError")} />;
  const all = query.data ?? [];
  const open = all.filter((a) => a.status === "submitted");
  const list = showAll ? all : open;
  return (
    <section aria-label={t("admin.tab.doctorApplications")} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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

function DoctorsPanel({ query }: { query: ReturnType<typeof usePendingDoctorLinks> }) {
  const { t, fmt } = useI18n();
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
  const clinics = useAdminClinics();
  const add = useAddClinicMember();
  const setActive = useSetMembershipActive();
  const [clinicId, setClinicId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Membership["role"]>("clinic_staff");
  const [error, setError] = useState<string | null>(null);
  const adding = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (clinics.isLoading || clinics.error) {
    return <PanelState query={clinics} errorTitle={t("admin.loadError")} />;
  }
  if (memberships.isLoading || memberships.error) {
    return <PanelState query={memberships} errorTitle={t("admin.loadError")} />;
  }
  const realClinics = (clinics.data ?? []).filter((c) => !c.isSample);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (adding.current) return;
    if (!clinicId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError(t("admin.memberInvalid"));
      return;
    }
    setError(null);
    adding.current = true;
    try {
      await add.mutateAsync({ clinicId, email, role });
      if (mounted.current) {
        toast.success(t("admin.memberAdded"));
        setEmail("");
      }
    } catch (err) {
      if (mounted.current)
        setError(
          /no CareConnect account/i.test(messageOf(err))
            ? t("admin.noAccount")
            : t(describeDataError(err)),
        );
    } finally {
      adding.current = false;
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
              disabled={add.isPending}
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
              disabled={add.isPending}
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
              disabled={add.isPending}
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
