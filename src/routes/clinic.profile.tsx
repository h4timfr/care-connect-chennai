import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { InfoNotice } from "@/components/common";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/clinic/profile")({
  component: ClinicProfileDetails,
});

function ClinicProfileDetails() {
  const { activeClinic } = useApp();
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
  ];

  return (
    <ClinicShell title={title} description={t("clinicProfile.subtitle")}>
      <div className="max-w-2xl space-y-4">
        <InfoNotice className="text-sm">{t("clinicProfile.readOnly")}</InfoNotice>
        <dl className="surface-card grid gap-4 p-6 text-sm">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd
                className={d.value ? "break-words font-medium" : "text-muted-foreground"}
                dir={d.value && d.ltr ? "ltr" : undefined}
              >
                {d.value || t("common.notProvided")}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </ClinicShell>
  );
}
