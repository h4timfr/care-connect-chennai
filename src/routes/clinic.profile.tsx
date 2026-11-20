import { pageTitles } from "@/lib/page-titles";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, CheckCircle2, Circle } from "lucide-react";
import { VerificationPill } from "@/components/ProviderStatus";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { Button } from "@/components/ui/button";
import { ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { describeDataError } from "@/lib/supabase/errors";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { type MemberClinic, useMyClinicContacts } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";
import {
  scheduleHasBookableWindow,
  useClinicDoctorLinks,
  useClinicSchedules,
} from "@/lib/supabase/providers";

export const Route = createFileRoute("/clinic/profile")({
  head: () => ({ meta: [{ title: pageTitles.clinic }] }),
  component: ClinicProfileDetails,
});

function roleKey(role: MemberClinic["memberRole"]): MessageKey {
  return role === "clinic_admin" || role === "clinic_staff"
    ? `clinicShell.role.${role}`
    : "clinicShell.role.other";
}

function ClinicProfileDetails() {
  const { activeClinic } = useApp();
  const { user } = useAuth();
  const contacts = useMyClinicContacts(user?.id, { enabled: !!activeClinic });
  const configured =
    !!activeClinic &&
    !activeClinic.isSample &&
    activeClinic.verificationState === "verified" &&
    activeClinic.isPublished &&
    activeClinic.bookingEnabled;
  const links = useClinicDoctorLinks(configured ? activeClinic?.id : undefined);
  const verified = new Set(
    (links.error ? [] : (links.data ?? []))
      .filter((link) => link.active && link.state === "verified" && !link.isSample)
      .map((link) => link.doctorId),
  );
  const hours = useClinicSchedules(verified.size ? activeClinic?.id : undefined);
  const availabilityError = links.error ?? hours.error;
  const checking = links.isLoading || hours.isLoading;
  const { t, fmt } = useI18n();
  const title = t("clinicProfile.title");

  // ClinicShell shows the loading / no-access states until a clinic is active.
  if (!activeClinic) return <ClinicShell title={title}>{null}</ClinicShell>;
  if (contacts.isPending) {
    return (
      <ClinicShell title={title}>
        <PageLoader />
      </ClinicShell>
    );
  }
  if (contacts.error) {
    return (
      <ClinicShell title={title}>
        <ErrorState
          title={title}
          message={t(describeDataError(contacts.error))}
          onRetry={() => void contacts.refetch()}
        />
      </ClinicShell>
    );
  }

  const clinicContact = contacts.data?.find((contact) => contact.clinic_id === activeClinic.id);

  const details: { label: string; value: string; ltr?: boolean }[] = [
    { label: t("clinicProfile.name"), value: activeClinic.name },
    { label: t("clinicProfile.description"), value: activeClinic.about },
    { label: t("common.address"), value: activeClinic.address },
    { label: t("common.area"), value: activeClinic.area },
    { label: t("common.phone"), value: clinicContact?.phone ?? "", ltr: true },
    { label: t("common.email"), value: clinicContact?.email ?? "", ltr: true },
    {
      label: t("common.specialties"),
      value: activeClinic.specialtyIds.map(fmt.specialty).join(", "),
    },
    {
      label: t("clinic.openingHours"),
      value: activeClinic.openingHours.map((h) => `${h.day}: ${h.hours}`).join(" · "),
    },
  ];
  // Completeness covers what patients see on the public clinic page, nothing more.
  const missing = details.filter((d) => !d.value.trim()).map((d) => d.label);
  const done = details.length - missing.length;
  const bookable =
    configured &&
    !availabilityError &&
    (hours.data ?? []).some(
      (schedule) =>
        verified.has(schedule.doctorId) &&
        scheduleHasBookableWindow(schedule.startTime, schedule.endTime, schedule.slotMinutes),
    );
  const contact = activeClinic.patientContactPermission;

  const status: { label: string; value: string; good: boolean | null }[] = [
    { label: t("clinicProfile.yourRole"), value: t(roleKey(activeClinic.memberRole)), good: null },
    {
      label: t("clinicProfile.listing"),
      value: activeClinic.isSample
        ? t("clinicProfile.listingSample")
        : activeClinic.isPublished && activeClinic.verificationState === "verified"
          ? t("clinicProfile.listingReal")
          : t("clinicWorkspace.unpublished"),
      good:
        !activeClinic.isSample &&
        activeClinic.isPublished &&
        activeClinic.verificationState === "verified",
    },
    {
      label: t("clinicProfile.booking"),
      value: checking
        ? t("common.loading")
        : availabilityError
          ? t("clinicWorkspace.unavailable")
          : bookable
            ? t("clinicWorkspace.bookingConfigured")
            : t("clinicProfile.bookingOff"),
      good: checking || availabilityError ? null : bookable,
    },
    {
      label: t("clinicWorkspace.bookingPermission"),
      value: t(
        activeClinic.bookingEnabled ? "clinicWorkspace.enabled" : "clinicWorkspace.disabled",
      ),
      good: activeClinic.bookingEnabled,
    },
    {
      label: t("clinicWorkspace.patientContact"),
      value: t(`admin.contact.${contact}`),
      good: contact === "granted",
    },
  ];

  return (
    <ClinicShell title={title}>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="surface-card flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <h2
              dir="auto"
              className="min-w-0 font-display text-lg font-bold [overflow-wrap:anywhere]"
            >
              {activeClinic.name}
            </h2>
            {activeClinic.isSample ? null : (
              <VerificationPill state={activeClinic.verificationState} />
            )}
          </div>
          <InfoNotice className="text-sm">{t("clinicProfile.readOnly")}</InfoNotice>
          <dl className="surface-card grid gap-4 p-4 text-sm sm:grid-cols-2 sm:p-5">
            {details.map((d) => (
              <div key={d.label} className="min-w-0">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd
                  className={
                    d.value ? "font-medium [overflow-wrap:anywhere]" : "text-muted-foreground"
                  }
                  dir={d.value ? (d.ltr ? "ltr" : "auto") : undefined}
                >
                  {d.value || t("common.notProvided")}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="surface-card p-5" aria-labelledby="clinic-status-heading">
            <h2 id="clinic-status-heading" className="font-semibold">
              {t("clinicProfile.statusTitle")}
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              {status.map((s) => (
                <div key={s.label} className="min-w-0">
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd
                    className={cn(
                      "font-medium",
                      s.good === true && "text-success",
                      s.good === false && "text-warning-foreground dark:text-warning",
                    )}
                  >
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
            {availabilityError ? (
              <div className="mt-3" role="alert">
                <p className="mb-2 text-sm">{t(describeDataError(availabilityError))}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void (links.error ? links.refetch() : hours.refetch())}
                >
                  {t("common.tryAgain")}
                </Button>
              </div>
            ) : !bookable && !checking ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("clinicProfile.bookingHow")} {t("setup.publishingHelp")}
              </p>
            ) : null}
          </section>

          <section className="surface-card p-5" aria-labelledby="clinic-completeness-heading">
            <h2 id="clinic-completeness-heading" className="font-semibold">
              {t("clinicProfile.completeness")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("clinicProfile.completeCount", { done, total: details.length })}
            </p>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={details.length}
              aria-valuenow={done}
              aria-label={t("clinicProfile.completeness")}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(done / details.length) * 100}%` }}
              />
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {details.map((d) => {
                const present = !!d.value.trim();
                return (
                  <li key={d.label} className="flex items-center gap-2">
                    {present ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className={present ? undefined : "text-muted-foreground"}>
                      {d.label}
                      <span className="sr-only">
                        {" "}
                        — {present ? t("clinicProfile.provided") : t("common.notProvided")}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {missing.length ? (
              <p className="mt-3 text-xs text-muted-foreground">{t("clinicProfile.missingHow")}</p>
            ) : null}
          </section>
        </aside>
      </div>
    </ClinicShell>
  );
}
