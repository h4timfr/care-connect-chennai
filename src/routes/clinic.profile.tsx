import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Circle } from "lucide-react";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { InfoNotice } from "@/components/common";
import { useApp } from "@/lib/store";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { clinicHasBookableDoctor, type MemberClinic } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/clinic/profile")({
  component: ClinicProfileDetails,
});

function roleKey(role: MemberClinic["memberRole"]): MessageKey {
  return role === "clinic_admin" || role === "clinic_staff"
    ? `clinicShell.role.${role}`
    : "clinicShell.role.other";
}

function ClinicProfileDetails() {
  const { activeClinic, doctorsOfClinic, catalog } = useApp();
  const { t, fmt } = useI18n();
  const title = t("clinicProfile.title");

  // ClinicShell shows the loading / no-access states until a clinic is active.
  if (!activeClinic) return <ClinicShell title={title}>{null}</ClinicShell>;

  const details: { label: string; value: string; ltr?: boolean }[] = [
    { label: t("clinicProfile.name"), value: activeClinic.name },
    { label: t("clinicProfile.description"), value: activeClinic.about },
    { label: t("common.address"), value: activeClinic.address },
    { label: t("common.area"), value: activeClinic.area },
    { label: t("common.phone"), value: activeClinic.phone, ltr: true },
    { label: t("common.email"), value: activeClinic.email, ltr: true },
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
  // Mirrors the clinic-aware booking RPC, including clinic publication and explicit booking state.
  const bookable = clinicHasBookableDoctor(activeClinic.id, doctorsOfClinic(activeClinic.id));

  const status: { label: string; value: string; good: boolean | null }[] = [
    { label: t("clinicProfile.yourRole"), value: t(roleKey(activeClinic.memberRole)), good: null },
    {
      label: t("clinicProfile.listing"),
      value: activeClinic.isSample
        ? t("clinicProfile.listingSample")
        : t("clinicProfile.listingReal"),
      good: !activeClinic.isSample,
    },
    {
      label: t("clinicProfile.booking"),
      value: catalog.error
        ? t("common.notProvided")
        : bookable
          ? t("clinicProfile.bookingOn")
          : t("clinicProfile.bookingOff"),
      good: catalog.error ? null : bookable,
    },
  ];

  return (
    <ClinicShell title={title} description={t("clinicProfile.subtitle")}>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <InfoNotice className="text-sm">{t("clinicProfile.readOnly")}</InfoNotice>
          <dl className="surface-card grid gap-4 p-6 text-sm">
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
            {!bookable && !catalog.error ? (
              <p className="mt-3 text-xs text-muted-foreground">{t("clinicProfile.bookingHow")}</p>
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
