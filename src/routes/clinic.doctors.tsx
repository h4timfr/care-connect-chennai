import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { useApp } from "@/lib/store";
import { ErrorState, Initials, PageLoader } from "@/components/common";
import { describeDataError } from "@/lib/supabase/errors";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/clinic/doctors")({
  component: ClinicDoctors,
});

function ClinicDoctors() {
  const { doctors, activeClinic, catalog } = useApp();
  const { t, fmt } = useI18n();
  const title = t("clinicDoctors.title");
  const subtitle = t("clinicDoctors.subtitle");

  // ClinicShell shows the loading / no-access states until a clinic is active.
  if (!activeClinic) return <ClinicShell title={title}>{null}</ClinicShell>;
  if (catalog.isLoading || catalog.error) {
    return (
      <ClinicShell title={title} description={subtitle}>
        {catalog.error ? (
          <ErrorState
            title={t("clinicDoctors.loadError")}
            message={t(describeDataError(catalog.error))}
            onRetry={catalog.refetch}
          />
        ) : (
          <PageLoader label={t("clinicDoctors.loading")} />
        )}
      </ClinicShell>
    );
  }

  const clinicDoctors = doctors.filter((d) => d.clinicIds?.includes(activeClinic.id));

  return (
    <ClinicShell title={title} description={subtitle}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clinicDoctors.map((d) => {
          const link = d.clinicLinks.find((l) => l.clinicId === activeClinic.id);
          return (
            <div key={d.id} className="surface-card space-y-4 p-5">
              <div className="flex gap-3">
                <Initials name={d.name} className="h-12 w-12" />
                <div className="min-w-0">
                  <h3 className="font-display font-semibold">{d.name}</h3>
                  <p className="text-sm text-primary">{fmt.specialty(d.specialtyId)}</p>
                </div>
              </div>
              <dl className="space-y-1 text-sm text-muted-foreground">
                <div className="flex gap-1.5">
                  <dt className="font-semibold text-foreground">{t("clinicDoctors.fee")}:</dt>
                  <dd>{fmt.inr(d.consultationFee)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="font-semibold text-foreground">
                    {t("clinicDoctors.experience")}:
                  </dt>
                  <dd>{t.plural("common.years", d.experienceYears)}</dd>
                </div>
                <div className="flex min-w-0 gap-1.5">
                  <dt className="shrink-0 font-semibold text-foreground">
                    {t("clinicDoctors.languages")}:
                  </dt>
                  <dd className="truncate">{d.languages.map(fmt.languageName).join(", ")}</dd>
                </div>
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="font-semibold text-foreground">
                    {t("clinicDoctors.onlineBooking")}:
                  </dt>
                  <dd>
                    {link?.active && link.verified
                      ? t("clinicDoctors.enabled")
                      : t("clinicDoctors.pending")}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
        {clinicDoctors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("clinicDoctors.none")}</p>
        ) : null}
      </div>
    </ClinicShell>
  );
}
